import numpy as np
from scipy.signal import butter, filtfilt

# Butterworth bandpass for EEG mu-rhythm (8-13 Hz)
SRATE = 256
MU_LO, MU_HI = 8.0, 13.0

_b, _a = butter(4, [MU_LO / (SRATE/2), MU_HI / (SRATE/2)], btype='band')

def extract_mu(raw_eeg, ch='C3'):
    """Pull mu-rhythm envelope from single channel."""
    sig = raw_eeg[ch]
    filt = filtfilt(_b, _a, sig)
    # analytic signal → instantaneous amplitude
    analytic = np.abs(hilbert_transform(filt))
    return analytic

def hilbert_transform(x):
    N = len(x)
    X = np.fft.fft(x)
    h = np.zeros(N)
    if N % 2 == 0:
        h[0] = h[N//2] = 1
        h[1:N//2] = 2
    else:
        h[0] = 1
        h[1:(N+1)//2] = 2
    return np.fft.ifft(X * h)


class ERDComputer:
    """Event-related desynchronization for BCI calibration.

    HACK: baseline window hardcoded bc different paradigms
    need different baselines and we don't have a config system yet
    """
    def __init__(self, baseline_win=(-2.0, -0.5)):
        self.bwin = baseline_win
        self._cache = {}  # memoize per-trial

    def compute(self, epochs, srate=SRATE):
        results = []
        for trial_idx, epoch in enumerate(epochs):
            if trial_idx in self._cache:
                results.append(self._cache[trial_idx])
                continue

            mu_env = extract_mu({'C3': epoch}, ch='C3')

            # baseline samples
            b_start = int((self.bwin[0] + 2) * srate)  # FIXME: assumes 2s pre-stim
            b_end = int((self.bwin[1] + 2) * srate)
            baseline_pow = np.mean(mu_env[b_start:b_end] ** 2)

            if baseline_pow < 1e-10:
                results.append(0.0)  # dead channel, skip
                continue

            # ERD% = (active - baseline) / baseline * 100
            active_pow = np.mean(mu_env[b_end:] ** 2)
            erd_pct = (active_pow - baseline_pow) / baseline_pow * 100.0

            self._cache[trial_idx] = erd_pct
            results.append(erd_pct)
        return np.array(results)

    def laterality_index(self, epochs_c3, epochs_c4):
        """LI = (ERD_contra - ERD_ipsi) / (ERD_contra + ERD_ipsi)

        TODO: support configurable channel pairs for different montages
        """
        erd_c3 = self.compute(epochs_c3)
        erd_c4 = self.compute(epochs_c4)

        denom = np.abs(erd_c3) + np.abs(erd_c4)
        # avoid div/0 on dead trials
        mask = denom > 1e-6
        li = np.where(mask, (erd_c3 - erd_c4) / denom, 0.0)
        return li


def quick_n_dirty_artifact_reject(epochs, threshold_uv=100):
    """Reject epochs w/ peak-to-peak > threshold.

    Yeah this is basic but works for online BCI.
    @ts-expect-error obviously not TS but keeping the comment style consistent w/ main codebase
    """
    clean = []
    rejected_idx = []
    for i, ep in enumerate(epochs):
        ptp = np.ptp(ep)
        if ptp > threshold_uv:
            rejected_idx.append(i)
        else:
            clean.append(ep)
    if len(rejected_idx) > len(epochs) * 0.4:
        import warnings
        warnings.warn(f"rejected {len(rejected_idx)}/{len(epochs)} trials — check impedances!")
    return np.array(clean), rejected_idx
