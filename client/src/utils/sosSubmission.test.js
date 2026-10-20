import test from "node:test";
import assert from "node:assert/strict";
import { classifySosSubmissionError, sosSubmissionStatus } from "./sosSubmission.js";

test("SOS submission errors distinguish authentication, validation, server, timeout, and network failures", () => {
  assert.equal(classifySosSubmissionError({ response: { status: 401 } }), "authentication");
  assert.equal(classifySosSubmissionError({ response: { status: 403 } }), "authorization");
  assert.equal(classifySosSubmissionError({ response: { status: 400 } }), "validation");
  assert.equal(classifySosSubmissionError({ response: { status: 503 } }), "server");
  assert.equal(classifySosSubmissionError({ response: { status: 408 } }), "timeout");
  assert.equal(classifySosSubmissionError({ response: { status: 404 } }), "endpoint");
  assert.equal(classifySosSubmissionError({ code: "ECONNABORTED" }), "timeout");
  assert.equal(classifySosSubmissionError({ code: "ERR_NETWORK" }), "network");
});

test("authentication and validation failures are not reported as connectivity failures", () => {
  assert.match(sosSubmissionStatus({ kind: "authentication" }), /valid sign-in/);
  assert.match(sosSubmissionStatus({ kind: "authorization" }), /not authorized/);
  assert.match(sosSubmissionStatus({ kind: "validation", message: "Invalid clientId" }), /Invalid clientId/);
  assert.doesNotMatch(sosSubmissionStatus({ kind: "authentication" }), /could not be reached/i);
});
