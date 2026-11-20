from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)

def weighted_average(existing_qty: Decimal, existing_value: Decimal,
                     incoming_qty: Decimal, incoming_unit_cost: Decimal) -> Decimal:
    total_qty = existing_qty + incoming_qty
    if total_qty <= 0:
        return Decimal("0")
    return (existing_value + incoming_qty * incoming_unit_cost) / total_qty

def variance_percent(actual: Decimal, planned: Decimal) -> Decimal:
    if planned == 0:
        return Decimal("0")
    return ((actual - planned) / planned * Decimal("100")).quantize(Decimal("0.001"))

def gst_split(taxable: Decimal, rate: Decimal, intra_state: bool) -> dict:
    tax = money(taxable * rate / Decimal("100"))
    if intra_state:
        half = money(tax / Decimal("2"))
        return {"cgst": half, "sgst": half, "igst": Decimal("0.00")}
    return {"cgst": Decimal("0.00"), "sgst": Decimal("0.00"), "igst": tax}
