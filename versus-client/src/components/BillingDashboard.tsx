export function BillingDashboard() {
  return (
    <div className="section">
      <div className="section-container space-y-6">
        <h2 className="section-title">usage-based billing</h2>
        <p className="section-description">
          The server exposes an x402-compliant flow for charging agents or players per request.
          Configure the gateway via the `X402_*` environment variables and use the endpoints
          below to mint charges, inspect status, and return HTTP 402 responses with payment
          metadata.
        </p>

        <div className="card">
          <h3 className="card-title">API surface</h3>
          <ul className="card-list">
            <li>
              <code>POST /api/v1/payments/x402/charges</code> → create a new Coinbase Commerce
              charge (returns hosted URL and `X-402-Payment-Required` headers)
            </li>
            <li>
              <code>GET /api/v1/payments/x402/charges/:chargeId</code> → fetch the latest status
              (use <code>?source=remote</code> to force refresh)
            </li>
            <li>
              <code>POST /api/v1/payments/x402/webhook</code> → receive Coinbase webhook events
              (set `X402_WEBHOOK_SECRET` to verify signatures)
            </li>
            <li>
              <code>POST /api/v1/payments/x402/402</code> → helper that returns an immediate HTTP
              402 response with payment headers for on-demand gating
            </li>
          </ul>
        </div>

        <div className="card">
          <h3 className="card-title">Integration tips</h3>
          <ul className="card-list">
            <li>Respond with status <code>402</code> and forward the emitted headers when quota is exhausted.</li>
            <li>Store the <code>chargeId</code> alongside the session or request you are gating.</li>
            <li>Listen to the webhook to mark payments as <em>completed</em> before resuming the workflow.</li>
            <li>Use `X402_SETTLEMENT_ADDRESS` if you want to advertise a custodial wallet alongside hosted links.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
