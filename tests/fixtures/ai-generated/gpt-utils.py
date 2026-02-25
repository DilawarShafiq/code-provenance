"""
This module provides utility functions for common data processing tasks.
It includes helpers for string manipulation, data validation, and formatting.
"""

from typing import Any, Dict, List, Optional
import re
import json


def validate_email(email: str) -> bool:
    """
    This function validates an email address using a regex pattern.
    It checks if the email matches the standard email format.

    Args:
        email: The email string to validate

    Returns:
        True if the email is valid, False otherwise
    """
    # Step 1: Check if the email is not empty
    if not email or not isinstance(email, str):
        return False

    # Step 2: Define the regex pattern for email validation
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    # Step 3: Check if the email matches the pattern
    result = re.match(pattern, email)

    # Step 4: Return the result as a boolean
    return result is not None


def format_currency(amount: float, currency: str = "USD") -> str:
    """
    This function formats a numeric amount as a currency string.
    It handles different currency codes and decimal places.

    Args:
        amount: The numeric amount to format
        currency: The currency code (default: USD)

    Returns:
        A formatted currency string
    """
    # Define the currency symbols
    symbols = {
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
    }

    # Get the symbol for the currency
    symbol = symbols.get(currency, currency)

    # Format the amount with two decimal places
    formatted = f"{amount:,.2f}"

    # Return the formatted string
    return f"{symbol}{formatted}"


def parse_json_safely(data: str) -> Optional[Dict[str, Any]]:
    """
    This function safely parses a JSON string into a dictionary.
    It handles parsing errors gracefully and returns None on failure.

    Args:
        data: The JSON string to parse

    Returns:
        The parsed dictionary or None if parsing fails
    """
    # Check if the input is valid
    if not data or not isinstance(data, str):
        return None

    # Try to parse the JSON string
    try:
        # Parse the JSON data
        result = json.loads(data)
        # Verify the result is a dictionary
        if isinstance(result, dict):
            return result
        return None
    except json.JSONDecodeError:
        # Return None if parsing fails
        return None


def flatten_list(nested_list: List[Any]) -> List[Any]:
    """
    This function flattens a nested list into a single-level list.
    It recursively processes all nested levels.

    Args:
        nested_list: The nested list to flatten

    Returns:
        A flattened list containing all elements
    """
    # Initialize the result list
    result = []

    # Iterate through each element
    for item in nested_list:
        # Check if the item is a list
        if isinstance(item, list):
            # Recursively flatten the nested list
            result.extend(flatten_list(item))
        else:
            # Add the item to the result
            result.append(item)

    # Return the flattened list
    return result


def truncate_string(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """
    This function truncates a string to a specified maximum length.
    It adds a suffix to indicate truncation.

    Args:
        text: The string to truncate
        max_length: The maximum length (default: 100)
        suffix: The suffix to append (default: "...")

    Returns:
        The truncated string
    """
    # Check if truncation is needed
    if len(text) <= max_length:
        return text

    # Calculate the truncation point
    truncation_point = max_length - len(suffix)

    # Truncate the string and add the suffix
    return text[:truncation_point] + suffix


def calculate_percentage(value: float, total: float) -> float:
    """
    This function calculates the percentage of a value relative to a total.
    It handles division by zero gracefully.

    Args:
        value: The value to calculate percentage for
        total: The total value

    Returns:
        The calculated percentage
    """
    # Check for division by zero
    if total == 0:
        return 0.0

    # Calculate the percentage
    percentage = (value / total) * 100

    # Round to two decimal places
    return round(percentage, 2)
