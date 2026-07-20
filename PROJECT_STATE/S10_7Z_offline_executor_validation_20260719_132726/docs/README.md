# Weekend Readiness

S10.7Z validates the S10.7Y executor using isolated fake systemd and filesystem fixtures.

Scenarios:
- all stages pass with no existing drop-in
- failure at stage 100 with no existing drop-in
- all stages pass with an existing drop-in
- failure at stage 150 with an existing drop-in

No SSH or VPS actions are executed.
