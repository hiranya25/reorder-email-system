/** Runs the in-memory fake Mailchimp for the e2e tests (see packages/mailchimp/src/fake.ts). */
import { startFakeServer } from "@reorder/mailchimp/fake";

startFakeServer(3290);
console.log("Fake Mailchimp on http://127.0.0.1:3290");
