// This file contains utility functions for common operations
// These utilities are used throughout the application

// This function formats a date into a human-readable string
// It takes a Date object and returns a formatted string
function formatDate(date: Date): string {
  // Get the individual components of the date
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();

  // Pad single digit numbers with a leading zero
  const paddedMonth = month.toString().padStart(2, '0');
  const paddedDay = day.toString().padStart(2, '0');
  const paddedHours = hours.toString().padStart(2, '0');
  const paddedMinutes = minutes.toString().padStart(2, '0');

  // Return the formatted date string
  return `${year}-${paddedMonth}-${paddedDay} ${paddedHours}:${paddedMinutes}`;
}

// This function validates an email address
// It uses a regular expression to check if the email format is valid
function validateEmail(email: string): boolean {
  // Define the email validation pattern
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // Test the email against the pattern and return the result
  return emailPattern.test(email);
}

// This function generates a random string of a specified length
// It can be used for generating tokens, IDs, or other random strings
function generateRandomString(length: number): string {
  // Define the characters that can be used in the random string
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  // Loop through and add random characters to the result
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  // Return the generated random string
  return result;
}

// This function converts a string to title case
// It capitalizes the first letter of each word in the string
function toTitleCase(input: string): string {
  // Split the string into words
  const words = input.toLowerCase().split(' ');

  // Capitalize the first letter of each word
  const titleCaseWords = words.map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  });

  // Join the words back together and return
  return titleCaseWords.join(' ');
}

// This function calculates the average of an array of numbers
// It returns 0 if the array is empty to avoid division by zero
function calculateAverage(numbers: number[]): number {
  // Check if the array is empty
  if (numbers.length === 0) {
    return 0;
  }

  // Calculate the sum of all numbers
  const sum = numbers.reduce((accumulator, current) => {
    return accumulator + current;
  }, 0);

  // Divide the sum by the count to get the average
  return sum / numbers.length;
}

// This function debounces a function call
// It delays the execution until after a specified wait time
function debounce<T extends (...args: any[]) => void>(
  func: T,
  waitTime: number
): (...args: Parameters<T>) => void {
  // Store the timeout ID so we can clear it later
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Return a new function that wraps the original function
  return function (...args: Parameters<T>): void {
    // Clear the previous timeout if it exists
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set a new timeout to call the function after the wait time
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, waitTime);
  };
}

// This function safely parses a JSON string
// It returns null if the parsing fails instead of throwing an error
function safeJsonParse<T>(jsonString: string): T | null {
  try {
    // Attempt to parse the JSON string
    const result = JSON.parse(jsonString) as T;
    return result;
  } catch (error) {
    // If parsing fails, log the error and return null
    console.error('Failed to parse JSON:', error);
    return null;
  }
}

// This function truncates a string to a specified maximum length
// It adds an ellipsis if the string was truncated
function truncateString(text: string, maxLength: number): string {
  // Check if truncation is needed
  if (text.length <= maxLength) {
    return text;
  }

  // Truncate the string and add an ellipsis
  return text.slice(0, maxLength - 3) + '...';
}

// Export all utility functions
export {
  formatDate,
  validateEmail,
  generateRandomString,
  toTitleCase,
  calculateAverage,
  debounce,
  safeJsonParse,
  truncateString,
};
