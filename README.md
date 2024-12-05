# MySQL PostgREST

Demo application to build a REST API over a planetscale database.

## Installation

1. Create a hosted MySQL database (ex. using [Aiven's free tier](https://aiven.io/pricing?product=mysql)) and grab the connection parameters
2. Create a table following [planetscale's quickstart](https://planetscale.com/docs/tutorials/planetscale-quick-start-guide)
3. Create an `admin` role and grant it full access

```sql
CREATE ROLE 'admin'
GRANT ALL on app_db.* to 'admin'
```

4. Grant your user the admin role. For example:

```sql
GRANT 'admin' to 'avnadmin';
```

5. Create a `.env` file at the root and set env vars from step 1

```
NEXT_PUBLIC_API_URL=# ex. "http://localhost:3000"
DATABASE_HOST=# ex. "aws.connect.psdb.cloud"
DATABASE_USERNAME=
DATABASE_PASSWORD=
DATABASE_PORT=
DATABASE_CA_CERTIFICATE=
```

6. Install and run

```bash
npm install
npm run dev
```
