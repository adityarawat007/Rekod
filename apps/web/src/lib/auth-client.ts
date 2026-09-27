import { createAuthClient } from 'better-auth/react';

/** Same origin as the page, so no base URL to keep in step with the deploy. */
export const authClient = createAuthClient();
