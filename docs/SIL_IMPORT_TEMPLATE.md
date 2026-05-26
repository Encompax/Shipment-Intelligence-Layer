# SIL Import Template

Use `frontend/public/templates/sil-shipment-intake-template.csv` to test the full local intake loop.

The template is intentionally shaped so one upload can feed three SIL paths:

- Loads: customer, origin, destination, mode, equipment, buy rate, sell rate.
- Carrier profiles: carrier name, MC/DOT, insurance, safety, credit, service score, on-time rate, falloff, preferred, blocked.
- Lane rates: origin/destination state, mode, equipment, low/median/high market rate, transit days, variance, sample size.

Recommended local validation:

1. Start the SIL backend and frontend.
2. Open Data Sources.
3. Create or select a CSV / Excel source.
4. Upload the template CSV.
5. Confirm the preview auto-maps the major fields.
6. Run `Import Mapped Loads`, `Import Carrier Profiles`, and `Import Lane Rates`.
7. Return to Transportation Command and confirm imported records can influence matching, market intelligence, and governance routing.

The template is demo-safe and contains no real business data.
