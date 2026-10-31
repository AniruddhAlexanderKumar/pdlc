# Language support (in progress)

The language picker offers English, Simplified Chinese, Hindi, Spanish and French. A first-visit prompt and the landing and access-request pages provide a choice before sign-in. The choice is remembered in browser storage and, once signed in, in the account's `users.language` field. A saved account choice takes precedence on another device; users can change it in Settings. The selector warns that translation is incomplete.

The navigation labels and most access-request form labels/options currently have translations. Other application screens, landing-page content, server errors, some accessibility labels and access-request success/error text still use English. User-entered content is not translated. This is not complete application localization and must not be represented as such; remaining strings and formatting need localization and review in all four non-English languages.

Migration `010_language` adds a nullable per-user preference. The authenticated `PUT /api/auth/language` validates supported language codes; `/api/auth/me` returns the saved preference. Unauthenticated selections remain local to the browser until an account is used.
