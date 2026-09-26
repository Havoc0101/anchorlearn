"""Validate optional grammatical annotations without altering transcript evidence."""
ROLES = {'subject', 'predicate', 'object', None}


def validate_annotations(value, source):
    if not isinstance(value, list):
        return []
    accepted, occupied = [], []
    for item in value[:24]:
        if not isinstance(item, dict):
            continue
        quote, parts, occurrence = item.get('quote'), item.get('parts'), item.get('occurrence')
        if (not isinstance(quote, str) or not quote.strip() or len(quote) > 300 or
                not isinstance(parts, list) or not 1 <= len(parts) <= 32 or
                type(occurrence) is not int or not 1 <= occurrence <= 100):
            continue
        if any(not isinstance(p, dict) or not isinstance(p.get('text'), str) or not p['text'] or
               not isinstance(p.get('role'), (str, type(None))) or p.get('role') not in ROLES for p in parts):
            continue
        if ''.join(p['text'] for p in parts) != quote or not any(p.get('role') for p in parts):
            continue
        start, offset = -1, 0
        for _ in range(occurrence):
            start = source.find(quote, offset)
            if start < 0:
                break
            offset = start + len(quote)
        if start < 0 or any(start < end and offset > begin for begin, end in occupied):
            continue
        occupied.append((start, offset))
        accepted.append({'quote': quote, 'occurrence': occurrence,
                         'parts': [{'text': p['text'], 'role': p.get('role')} for p in parts]})
    return accepted
