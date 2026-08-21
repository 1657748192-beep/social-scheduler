# Pinterest Sandbox recording mode

## Goal

Allow Social Scheduler to run the Pinterest connection and Image Pin publishing flow in Pinterest Sandbox, so the complete OAuth-to-Pin flow can be recorded for Pinterest Standard access review without attempting a production Pin while the app only has Trial access.

## Configuration and safety

- Add `PINTEREST_API_ENV` with the values `production` and `sandbox`; default to `production`.
- Production keeps the existing `https://api.pinterest.com/v5` endpoints.
- Sandbox uses `https://api-sandbox.pinterest.com/v5` for token exchange, account lookup, board operations, and Pin publishing. The browser authorization endpoint remains Pinterest's normal OAuth endpoint.
- Store the configured Pinterest environment in each newly connected Pinterest account's capabilities.
- A Pinterest account connected in one environment cannot be used after the server switches to the other environment. The API will require a reconnect instead of sending the token to the wrong endpoint.

## API and publisher behavior

- Centralize the Pinterest API base URL so OAuth and the publisher use the configured environment consistently.
- Add a workspace-authorized endpoint for creating a Pinterest board through the existing authenticated account.
- Board listing and Pin publishing use the same configured base URL.
- Expose the active Pinterest environment in OAuth provider status so the client can render an unambiguous Sandbox label.

## Composer behavior

- In Sandbox mode, show a clear `Pinterest Sandbox test mode` notice in the Pinterest settings panel.
- If a connected Pinterest Sandbox account has no boards, provide a small form to create a test board and reload the board list.
- Keep the existing requirements: exactly one image, a board, and a Pin title.
- Production does not display the Sandbox notice and retains normal behavior.

## Recording flow

1. Set `PINTEREST_API_ENV=sandbox` and deploy.
2. Disconnect any existing Pinterest production account and reconnect it through Social Scheduler so it receives a Sandbox token.
3. In the English UI, create a Sandbox board from the composer, upload one original image, complete the title, and publish.
4. Show the successful Sandbox result in calendar or post management. Do not represent the Sandbox result as a public production Pin.
5. Switch back to `production` only after the recording, deploy, and reconnect Pinterest before real publishing.

## Errors and testing

- Invalid environment values fail configuration validation at startup.
- Environment-mismatched account credentials return an actionable reconnect error.
- Unit tests cover URL selection, mismatch protection, Sandbox board creation request, and production defaults.
- Run the full API/web test suite, TypeScript lint checks, and production build before merging.

