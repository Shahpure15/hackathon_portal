from typing import Any

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    """Neutralises spreadsheet formula injection for CSV exports.

    If the value is a string beginning with '=', '+', '-', '@', '\t', or '\r'
    (including when preceded by leading spaces), prefixes it with a single quote "'"
    to prevent formula execution in spreadsheet software like Excel/Sheets.
    """
    if isinstance(value, str) and value:
        if value.startswith(FORMULA_PREFIXES) or value.lstrip(" ").startswith(FORMULA_PREFIXES):
            return f"'{value}"
    return value


def set_cell_safe(cell: Any, value: Any) -> None:
    """Safely assigns value to an openpyxl cell, preventing formula injection.

    Assigns cell.value = value. If value is a string starting with a formula trigger
    character ('=', '+', '-', '@', '\t', '\r'), sets cell.data_type = 's' (string)
    so spreadsheet software treats it as pure text rather than evaluating formulas.
    Does NOT prepend an apostrophe in openpyxl.
    """
    cell.value = value
    if isinstance(value, str) and value:
        if value.startswith(FORMULA_PREFIXES) or value.lstrip(" ").startswith(FORMULA_PREFIXES):
            cell.data_type = "s"


def sanitize_worksheet(ws: Any) -> None:
    """Scans all cells in an openpyxl worksheet and neutralises any potential formula injection.

    Forces cell.data_type = 's' for any cell containing a string starting with a formula trigger.
    """
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and cell.value:
                if cell.value.startswith(FORMULA_PREFIXES) or cell.value.lstrip(" ").startswith(FORMULA_PREFIXES):
                    cell.data_type = "s"


def sanitize_workbook(wb: Any) -> None:
    """Sanitizes all worksheets in an openpyxl workbook before saving/export."""
    for ws in wb.worksheets:
        sanitize_worksheet(ws)
