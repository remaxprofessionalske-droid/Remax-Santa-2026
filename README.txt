SECRET SANTA - Netlify deploy
1. Install Node.js, then: npm i -g netlify-cli
2. In this folder run: npm install
3. Run: netlify login, then netlify init (create a new site)
4. Set ADMIN_KEY to your organiser password as a secret environment variable scoped to Functions in production, Deploy Previews, and branch deploys. Deploy again after changing it to activate the new password.
5. Run: netlify deploy --prod
Open the site, use "Organiser tools" at the bottom, enter your password, set the draw date and draw.
