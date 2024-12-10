import Subzero, {
  SubzeroError,
  Env as QueryEnv,
  Method,
  getIntrospectionQuery,
  fmtMySqlEnv,
} from "@subzerocloud/rest";
import mysql, { PoolConfig } from "mariadb";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
const urlPrefix = "/api";
const schema = process.env.DATABASE_NAME!;
const dbType = "mysql";
export const dynamic = "force-dynamic"; // static by default, unless reading the request

let subzero: Subzero;
const role = "admin"; // Set according to permissions.json
const connectionParams: PoolConfig = {
  connectionLimit: 75,
  connectTimeout: 5 * 1000,
  insertIdAsNumber: true,
  bigIntAsNumber: true,
  port: parseInt(process.env.DATABASE_PORT!),
  //rowsAsArray: true,
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  allowPublicKeyRetrieval: true,
  trace: true,
  database: schema,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DATABASE_CA_CERTIFICATE,
  },
};

// WARNING! do not use this connection pool in other routes since the
// connections hold special user defined variables that might interfere with
// other queries
const subzeroDbPool = mysql.createPool(connectionParams);

async function introspectDatabaseSchema() {
  const permissionsFile = resolve(
    process.cwd(),
    "src/app/api/[...query]/permissions.json"
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let permissions: any[] = [];
  if (existsSync(permissionsFile)) {
    permissions = JSON.parse(readFileSync(permissionsFile, "utf8"));
  } else {
    console.error("permissions file not found", permissionsFile);
  }
  const { query, parameters } = getIntrospectionQuery(
    dbType,
    [schema], // the schema/database that is exposed to the HTTP api
    // the introspection query has two 'placeholders' to adapt to different configurations
    new Map([
      ["relations.json", []], // custom relations - empty for now
      ["permissions.json", permissions],
    ])
  );
  const db = await mysql.createConnection(connectionParams);
  const result = await db.query(query, parameters);
  const dbSchema = result[0].json_schema;
  await db.end();
  return dbSchema;
}

// Initialize the subzero instance that parses and formats queries
let initializing = false;
async function initSubzero() {
  if (initializing) {
    return;
  }
  initializing = true;

  let wait = 0.5;
  let retries = 0;
  const maxRetries = 3; // You can adjust this or make it configurable

  while (!subzero) {
    try {
      const dbSchema = await introspectDatabaseSchema();
      subzero = new Subzero(dbType, dbSchema);
    } catch (e) {
      const message = e instanceof Error ? e.message : e;
      retries++;
      if (maxRetries > 0 && retries > maxRetries) {
        throw e;
      }
      wait = Math.min(10, wait * 2); // Max 10 seconds between retries
      console.error(
        `Failed to connect to database (${message}), retrying in ${wait} seconds...`
      );
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }

  initializing = false;
}

// Similar implementation to Subzero's handler: https://github.com/subzerocloud/showcase/blob/main/node-myrest/src/server.ts#L234
async function handler(request: Request, method: Method) {
  if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    throw new SubzeroError(`Method ${method} not allowed`, 400);
  }
  // initialize the subzero instance if it is not initialized yet
  if (!subzero) {
    await initSubzero();
  }

  const queryEnv: QueryEnv = [
    ["role", role],
    ["request.method", method],
    ["request.headers", JSON.stringify(request.headers)],
    [
      "request.get",
      JSON.stringify(Object.fromEntries(new URL(request.url).searchParams)),
    ],
    ["request.jwt.claims", JSON.stringify({})],
  ];
  const { query: envQuery, parameters: envParameters } = fmtMySqlEnv(queryEnv);
  const db = await subzeroDbPool.getConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;

  try {
    await db.query("BEGIN");
    await db.query(envQuery, envParameters);

    if (method === "GET") {
      const { query, parameters } = await subzero.fmtStatement(
        schema,
        `${urlPrefix}/`,
        role,
        request,
        queryEnv
      );
      const rows = await db.query(query, parameters);
      result = rows[0].body ? JSON.parse(rows[0].body) : null;
    } else {
      const statement = await subzero.fmtTwoStepStatement(
        schema,
        `${urlPrefix}/`,
        role,
        request,
        queryEnv
      );
      const { query: mutate_query, parameters: mutate_parameters } =
        statement.fmtMutateStatement();
      const rows = await db.query(mutate_query, mutate_parameters);
      const { insertId, affectedRows } = rows;

      if (insertId > 0 && affectedRows > 0) {
        const ids = Array.from(
          { length: affectedRows },
          (_, i) => insertId + i
        );
        statement.setMutatedRows(ids);
      } else {
        const idRows = await db.query(`
          select t.val 
          from json_table(
              @subzero_ids, 
              '$[*]' columns (val integer path '$')
          ) as t
          left join json_table(
              @subzero_ignored_ids, 
              '$[*]' columns (val integer path '$')
          ) as t2 on t.val = t2.val
          where t2.val is null;
        `);
        statement.setMutatedRows(idRows);
      }

      const returnRepresentation = request.headers
        .get("Prefer")
        ?.includes("return=representation");
      if (returnRepresentation) {
        const { query: select_query, parameters: select_parameters } =
          statement.fmtSelectStatement();
        const selectResult = await db.query(select_query, select_parameters);
        result = selectResult[0].body ? JSON.parse(selectResult[0].body) : null;
      }
    }

    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function handlerWrapper(request: Request, method: Method) {
  try {
    return await handler(request, method);
  } catch (e) {
    if (e instanceof SubzeroError) {
      console.log("SubzeroError:", e);
      return new Response(e.toJSONString(), {
        status: e.status || 500,
        headers: { "content-type": "application/json" },
      });
    } else {
      console.log("Error:", e);
      return new Response((e as Error).toString(), { status: 500 });
    }
  }
}

export const GET = async (request: Request) =>
  await handlerWrapper(request, "GET");

export const PUT = async (request: Request) =>
  await handlerWrapper(request, "PUT");
export const POST = async (request: Request) =>
  await handlerWrapper(request, "POST");
export const PATCH = async (request: Request) =>
  await handlerWrapper(request, "PATCH");
export const DELETE = async (request: Request) =>
  await handlerWrapper(request, "DELETE");
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH",
      "access-control-allow-headers": "Content-Type, Prefer",
    },
  });
}
