# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: simulate_123_users.spec.js >> All 123 Teams Synchronized Browser Login Suite >> Simulate 123 Real Team Leaders logging in across parallel browser tabs
- Location: e2e\simulate_123_users.spec.js:12:3

# Error details

```
Test timeout of 300000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - button "Toggle Theme" [ref=e6] [cursor=pointer]
  - generic [ref=e9]:
    - img "MIT India Hackathon Logo" [ref=e10]
    - paragraph [ref=e11]: Sign in to access your dashboard
  - generic [ref=e12]:
    - generic [ref=e13]:
      - generic [ref=e14]: Username
      - textbox "Username" [ref=e20]:
        - /placeholder: Enter your username
        - text: mih91
    - generic [ref=e21]:
      - generic [ref=e22]: Password
      - generic [ref=e23]:
        - textbox "Password" [active] [ref=e28]:
          - /placeholder: ••••••••
          - text: 72197MIH91
        - button "Show password" [ref=e29] [cursor=pointer]
    - button "Sign In" [ref=e34] [cursor=pointer]
```