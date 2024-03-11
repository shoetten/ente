---
title: Verification code
description: Getting the OTP for a self host Ente
---

# Verification code

The self-hosted Ente by default does not send out emails, so you can pick the
verification code by:

-   Getting it from the server logs, or

-   Reading it from the DB (otts table)

You can also set pre-defined hardcoded OTTs for certain users when running
locally by creating a `museum.yaml` and adding the `internal.hardcoded-ott`
configuration setting to it. See
[local.yaml](https://github.com/ente-io/ente/blob/main/server/configurations/local.yaml)
in the server source code for details about how to define this.