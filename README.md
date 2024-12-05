## PlanetREST

Demo application to build a REST API over a planetscale database.

1. Create a Planetscale account and set up a DB connection
2. Create a table following [their quickstart](https://planetscale.com/docs/tutorials/planetscale-quick-start-guide)
3. Set env vars from step 1

NEXT_PUBLIC_API_URL=# ex. "http://localhost:3000"
DATABASE_HOST=# ex. "aws.connect.psdb.cloud"
DATABASE_USERNAME=
DATABASE_PASSWORD=

4. Install and run

```bash
npm install
npm run dev
```
