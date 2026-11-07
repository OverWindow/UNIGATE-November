import re


LABELS = "가나다라"


def choice_order(choice):
    if not isinstance(choice, str) or not re.fullmatch(r"\s*\([가나다라]\)(?:\s*[-–—→]\s*\([가나다라]\)){3}\s*", choice):
        raise ValueError("invalid_sentence_order")
    order = re.findall(r"\(([가나다라])\)", choice)
    if sorted(order) != list(LABELS):
        raise ValueError("invalid_sentence_order")
    return order


def sentence_material(passage, choices):
    parts = re.split(r"(?m)^\s*\(([가나다라])\)\s*", passage)
    if len(parts) != 9 or parts[0].strip() or sorted(parts[1::2]) != list(LABELS):
        raise ValueError("invalid_sentence_material")
    sentences = [{"id": parts[i], "text": parts[i + 1].strip()} for i in range(1, 9, 2)]
    if any(not sentence["text"] for sentence in sentences):
        raise ValueError("invalid_sentence_material")
    orders = [tuple(choice_order(choice)) for choice in choices]
    if len(orders) != 4 or len(set(orders)) != 4:
        raise ValueError("invalid_sentence_choices")
    return sentences


def valid_selected_order(order):
    if not isinstance(order, list) or len(order) != 4:
        return False
    if any(value is not None and (not isinstance(value, str) or value not in LABELS or len(value) != 1) for value in order):
        return False
    placed = [value for value in order if value is not None]
    return len(placed) == len(set(placed))
