# AfterHook

AfterHook is an open-source system that receives webhook events, processes them
asynchronously, and gives software teams a clear operational timeline for
delivery, failure, and safe retry.

Repository and npm name: `afterhook`.

## Current stage

Product specification only. No application code exists yet. Development starts
from the public backlog and preserves each reviewable phase in Git history.

## First release

The MVP will prove one complete journey:

1. create an endpoint and destination;
2. send a signed webhook;
3. reject invalid or duplicate input safely;
4. process the event in a background worker;
5. inspect the delivery timeline;
6. retry a failed delivery without creating uncontrolled duplicates.

Read the [product brief](docs/PRODUCT.md), [MVP scope](docs/SCOPE.md), and
[executable backlog](docs/BACKLOG.md).
