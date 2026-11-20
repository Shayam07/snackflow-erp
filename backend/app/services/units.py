from decimal import Decimal

FACTORS = {
    "kg": ("mass", Decimal("1000"), "g"),
    "g": ("mass", Decimal("1"), "g"),
    "litre": ("volume", Decimal("1000"), "ml"),
    "l": ("volume", Decimal("1000"), "ml"),
    "ml": ("volume", Decimal("1"), "ml"),
    "piece": ("count", Decimal("1"), "piece"),
    "packet": ("packet", Decimal("1"), "packet"),
    "carton": ("carton", Decimal("1"), "carton"),
}

def to_base(quantity: Decimal, unit: str, packets_per_carton: int | None = None) -> tuple[Decimal, str]:
    if unit == "carton":
        if not packets_per_carton:
            raise ValueError("carton conversion requires packets_per_carton")
        return quantity * Decimal(packets_per_carton), "packet"
    if unit not in FACTORS:
        raise ValueError(f"Unsupported unit: {unit}")
    _, factor, base = FACTORS[unit]
    return quantity * factor, base

def convert(quantity: Decimal, from_unit: str, to_unit: str,
            packets_per_carton: int | None = None) -> Decimal:
    if from_unit == "carton" or to_unit == "carton":
        if not packets_per_carton:
            raise ValueError("carton conversion requires packets_per_carton")
        if from_unit == "carton" and to_unit == "packet":
            return quantity * Decimal(packets_per_carton)
        if from_unit == "packet" and to_unit == "carton":
            return quantity / Decimal(packets_per_carton)
        raise ValueError("Only carton <-> packet conversion is supported")
    if from_unit not in FACTORS or to_unit not in FACTORS:
        raise ValueError("Unsupported unit")
    from_kind, from_factor, _ = FACTORS[from_unit]
    to_kind, to_factor, _ = FACTORS[to_unit]
    if from_kind != to_kind:
        raise ValueError(f"Incompatible units: {from_unit} and {to_unit}")
    return quantity * from_factor / to_factor
