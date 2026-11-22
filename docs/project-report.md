# SnackFlow ERP — Comprehensive Project & Architecture Report

**Order-to-Audit Management System for Packaged-Snacks Manufacturing**  
*Individual Prototype & Evaluation Report for the NIT Tiruchirappalli Problem Statement*

---

## 1. Executive Summary

**SnackFlow ERP** is an order-to-audit enterprise resource planning system tailored specifically for small-to-midscale packaged snack manufacturing facilities. The platform bridges the fragmented workflow between field sales representatives, factory inventory managers, production supervisors, accounting personnel, and executive owners.

Traditional SME manufacturers face severe margin leakages due to:
1. **Unrecorded Production Losses & Recipe Variances**: Discrepancies between planned bills of materials (BOM) and actual floor consumption.
2. **Flawed Inventory Valuation**: Static standard costing models that fail to track fluctuating raw commodity prices (e.g., cooking oil and flour).
3. **Billing Inconsistencies & GST Errors**: Manual invoicing leading to misplaced serial numbers, tax rate confusion, and untracked receivables.
4. **Disconnected Field Sales**: Sales reps taking orders on paper or messaging apps without real-time inventory visibility or offline guarantees.

SnackFlow ERP solves these challenges with an **immutable transaction-ledger design**, **dynamic moving weighted-average inventory valuation**, **BOM-driven batch yield variance analysis**, **automated GST compliance**, and an **offline-resilient modern web application**.

---

## 2. Core Architectural Pillars & Integrity Invariants

### 2.1 Double-Entry Inspired Append-Only Stock Movement Ledger
- **No Direct Balance Overwriting**: The inventory database has no mutable balance field. All inventory levels are computed as `SUM(quantity)` from `stock_movements`.
- **Signed Movements**:
  - Purchase Receipts: `+quantity`
  - Production Material Issues: `-quantity`
  - Production Output: `+quantity`
  - Sales Order Dispatch: `-quantity`
- **Audit Immutability**: ORM-level event listeners explicitly reject `UPDATE` and `DELETE` queries on posted ledger rows. Any adjustment requires an offsetting ledger record.

### 2.2 Moving Weighted-Average Valuation
Raw material pricing fluctuates with market conditions. SnackFlow maintains moving weighted-average costs per base unit (grams, millilitres, pieces):
$$\text{New Average Rate} = \frac{(\text{Current Qty} \times \text{Current Rate}) + (\text{Receipt Qty} \times \text{Receipt Rate})}{\text{Current Qty} + \text{Receipt Qty}}$$
- When raw materials are consumed in a production run, they are valued at the prevailing moving-average rate at that exact point in time.
- Capitalized run overheads (direct floor labour, LPG/fuel, electricity) are added via zero-quantity, positive-value movements to reflect true landed batch cost per good packet.

### 2.3 Strict Bill of Materials (BOM) & Variance Tolerance Guard
- Every product family (e.g. *Murukku*) has a standard BOM defining raw ingredient consumption per batch.
- Real-time yield variance is calculated as:
  $$\text{Yield Variance } (\%) = \frac{\text{Actual Output} - \text{Expected Output}}{\text{Expected Output}} \times 100$$
- Consumption variances outside the configurable tolerance ($\pm 3\%$) are automatically flagged with warning indicators for floor supervisors and executive review.
- Packaging capacity validation cross-references carton counts against actual packet yields to flag unboxed stock.

### 2.4 Atomic GST Sequence & Outward Supply Compliance
- **Financial Year Sequences**: Formatted as `INV/{FY}/{0001}` (e.g., `INV/2026-27/0001`).
- **Concurrency Protection**: Leverages `SELECT ... FOR UPDATE` and conditional inserts to prevent duplicate invoice numbers in high-concurrency environments.
- **Automated Tax Splits**: Intelligent single-rate CGST (2.5%) + SGST (2.5%) for intra-state supplies, with IGST (5%) capability for inter-state distribution.

---

## 3. Role-Based Access Control (RBAC) Matrix

| Persona | Permitted Routes & Actions | Business Responsibility |
|---|---|---|
| **Factory Admin** (`admin`) | Full system access: approve orders, edit prices, trigger invoices, dispatch goods, post purchases, audit logs. | Factory management, pricing revisions, end-to-end oversight. |
| **Production Supervisor** (`production`) | Production floor, BOM execution, batch runs, labour/gas overhead additions, purchase receipts. | Floor operations, recipe adherence, yield efficiency. |
| **Field Salesperson** (`salesman_a`, `salesman_b`) | Order submission, customer territory catalog, personal sales history, offline queue. | Order capture, retail relationship management. |
| **Auditor** (`auditor`) | Read-only ledger, statutory report generation (CSV, XLSX, PDF), GST registers. | Statutory verification, stock verification, tax audit. |
| **Business Owner** (`owner`) | Executive KPI dashboard, variance alerts, revenue summaries, margin oversight. | High-level business health, margin analysis. |

---

## 4. Benchmark Scenario Verification & Results

The system includes a fully automated end-to-end benchmark scenario (`scripts/benchmark_scenario.py`) simulating a complete operational cycle:
1. Opening stock initialization (Flour, Oil, Spices, Pouches, Cartons).
2. New raw material purchase receipt (60 kg flour @ ₹45/kg).
3. Production batch execution with intentional floor variances (188 good packets, 6 damaged pouches, 9 cartons).
4. Overhead capitalization (Labour ₹1,200 + Power ₹600).
5. Multi-line sales order creation by field salesman.
6. Admin order approval with real-time stock availability check.
7. GST invoice generation, printable PDF rendering & WhatsApp URL compilation.
8. Stock dispatch and payment collection recording.

### Benchmark Audit Results

| Audit Metric | Benchmark Standard | System Observed Result | Status |
|---|---:|---:|:---:|
| **Flour Closing Balance** | 120.0 kg | 120.0 kg | ✅ Verified |
| **Cooking Oil Closing Balance** | 19.5 L | 19.5 L | ✅ Verified |
| **Spice Mix Closing Balance** | 3.8 kg | 3.8 kg | ✅ Verified |
| **200g Pouches Closing Balance** | 306 pieces | 306 pieces | ✅ Verified |
| **Cartons Closing Balance** | 21 pieces | 21 pieces | ✅ Verified |
| **Finished Goods Post-Production** | 238 packets | 238 packets | ✅ Verified |
| **Finished Goods Post-Dispatch** | 88 packets | 88 packets | ✅ Verified |
| **Batch Yield Variance** | -6.0% | -6.0% (Flagged) | ✅ Verified |
| **Oil Material Variance** | +5.0% | +5.0% (Flagged) | ✅ Verified |
| **Pouch Variance** | -3.0% | -3.0% (Reported, Unflagged) | ✅ Verified |
| **Carton Packaging Variance** | -10.0% | -10.0% (Flagged) | ✅ Verified |
| **Retailer A Taxable Value** | ₹7,500.00 | ₹7,500.00 | ✅ Verified |
| **CGST / SGST (2.5% each)** | ₹187.50 / ₹187.50 | ₹187.50 / ₹187.50 | ✅ Verified |
| **Invoice Total Amount** | ₹7,875.00 | ₹7,875.00 | ✅ Verified |
| **Recorded Payment** | ₹4,000.00 | ₹4,000.00 | ✅ Verified |
| **Customer Outstanding Balance** | ₹3,875.00 | ₹3,875.00 | ✅ Verified |
| **Distributor B Shortage** | 32 packets | 32 packets (Blocked) | ✅ Verified |
| **Weighted Average Flour Rate** | ₹43.125 / kg | ₹43.125 / kg | ✅ Verified |
| **Total Production Run Cost** | ₹5,855.00 | ₹5,855.00 | ✅ Verified |
| **True Cost per Good Packet** | ₹31.14 | ₹31.14 | ✅ Verified |

---

## 5. UI/UX Modernization & Developer Experience

The interface was upgraded from minimal forms to an enterprise-grade, responsive dashboard:
- **1-Click Persona Switcher**: Instant login buttons for all 5 roles on the login page for rapid testing and demonstrations.
- **Live BOM & Yield Calculator**: Real-time formula preview displaying planned vs. actual consumption, dynamic variance percentages, and packaging capacity warnings before committing a run.
- **Smart Unit Converter Tool**: Built-in conversion utility translating bulk procurement units (e.g., kg, litres) into precision base units (grams, ml) and calculating base-unit rates automatically.
- **Status Stepper & Order Filters**: Tabbed order pipeline (Submitted $\rightarrow$ Approved $\rightarrow$ Invoiced $\rightarrow$ Dispatched) with live estimated price tallies.
- **Multi-Format Report Suite**: Filterable reporting center supporting on-demand streaming of CSV, Microsoft Excel (`.xlsx`), and formatted ReportLab PDF documents.
- **Offline Resilience**: Progressive Web App shell with IndexedDB queue ensuring field salesmen can book orders without active internet connectivity.

---

## 6. Verification & Automated Test Coverage

The system is validated by an automated PyTest test suite executing 17 comprehensive unit and integration tests:
- `test_unit_conversions`: Arithmetic precision across grams, ml, and bulk equivalents.
- `test_weighted_average_calculation`: Dynamic valuation updates across successive receipts.
- `test_bom_explosion_and_variance`: Recipe scaling and tolerance boundaries ($\pm 3\%$).
- `test_gst_tax_split`: Taxable subtotal, CGST, SGST, and rounding safeguards.
- `test_invoice_sequencing`: Financial year sequence generation and monotonicity.
- `test_duplicate_production_prevention`: Idempotency guards rejecting re-used `run_key`s.
- `test_shortage_response`: Stock validation preventing premature order approval.
- `test_payment_allocation`: Invoice balance reductions and ledger aging.
- `test_rbac_permissions`: Authorization barriers across all restricted endpoints.

**Result: 17 Passed, 0 Failed.**
