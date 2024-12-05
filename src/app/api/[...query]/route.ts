import Subzero, {
  SubzeroError,
  Env as QueryEnv,
  Method,
  Statement,
} from "@subzerocloud/nodejs";
// NOTE: I want to get this working with Planetscale serverless SDK eventually
// import { connect, Connection } from "@planetscale/database";
import mysql from "mariadb";

const urlPrefix = "/api";
const schema = "planetrest"; // My Planetscale Database name
const dbType = "mysql";
export const dynamic = "force-dynamic"; // static by default, unless reading the request

let subzero: Subzero;
const role = "Admin"; // Is this right?
const connectionParams = {
  connectionLimit: 10,
  connectTimeout: 10 * 1000,
  insertIdAsNumber: true,
  bigIntAsNumber: true,
  //rowsAsArray: true,
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  allowPublicKeyRetrieval: true,
  trace: true,
  ssl: {
    rejectUnauthorized: true,
  },
};

// WARNING! do not use this connection pool in other routes since the connections hold special user defined variables
// that might interfere with other queries
const subzeroDbPool = mysql.createPool(connectionParams);

function getJsonSchemaType(mysqlType: string): string {
  if (mysqlType.startsWith("tinyint(1)")) {
    return "number";
  } else if (mysqlType.includes("int")) {
    return "number";
  } else if (
    mysqlType.includes("decimal") ||
    mysqlType.includes("double") ||
    mysqlType.includes("float")
  ) {
    return "number";
  } else if (
    mysqlType.includes("datetime") ||
    mysqlType.includes("timestamp")
  ) {
    return "string";
  } else if (mysqlType.includes("date")) {
    return "string";
  } else if (mysqlType.includes("time")) {
    return "string";
  }
  return "string";
}

async function initSubzero() {
  // NOTE: This does not seem to work
  // const { query, parameters } = getIntrospectionQuery(
  //   dbType,
  //   schema // the schema name that is exposed to the HTTP api (ex: public, api)
  // );

  const connectionParams: mysql.ConnectionConfig = {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    allowPublicKeyRetrieval: true,
    trace: true,
    ssl: {
      rejectUnauthorized: true,
    },
  };
  const db = await mysql.createConnection(connectionParams);
  // Alternative way of introspecting, similar to airbyte
  // Seems to work but unsure if I am missing something
  // https://github.com/planetscale/airbyte-source/blob/c1ab01c5c4ca525b86d98a33dae27f280b516bb0/cmd/internal/planetscale_edge_database.go#L69
  const tableRes: Array<Record<string, string>> = await db.query(
    `show tables from ${schema}`
  );
  const tableNames = tableRes.map((row) => row[`Tables_in_${schema}`]);
  // console.log("Table names:", tableNames);
  const dbSchema: {
    use_internal_permissions: boolean;
    schemas: Array<{
      name: string;
      objects: Array<{
        name: string;
        kind: string;
        foreign_keys: Array<unknown>;
        permissions: Array<unknown>;
        columns: Array<{
          name: string;
          primary_key: boolean;
          data_type: string;
        }>;
      }>;
    }>;
  } = {
    use_internal_permissions: false,
    schemas: [],
  };
  for (const tableName of tableNames) {
    const columns: Array<{ COLUMN_NAME: string; COLUMN_TYPE: string }> =
      await db.query(
        `select column_name, column_type from information_schema.columns where table_name=? AND table_schema=?;`,
        [tableName, schema]
      );
    const primaryKeys: Array<{ COLUMN_NAME: string }> = await db.query(
      `select column_name from information_schema.columns where table_name=? AND table_schema=? AND column_key='PRI';`,
      [tableName, schema]
    );
    // console.log("Columns:", columns);
    // console.log("Primary keys:", primaryKeys);
    const colData = columns.map((column) => {
      return {
        name: column.COLUMN_NAME,
        primary_key: primaryKeys.some(
          (pk) => pk.COLUMN_NAME === column.COLUMN_NAME
        ),
        // Do mysql types work with subzero? I converted to generic JSON schema types just in case
        data_type: getJsonSchemaType(column.COLUMN_TYPE),
      };
    });

    dbSchema.schemas.push({
      name: schema,
      objects: [
        {
          name: tableName,
          kind: "table",
          columns: colData,
          foreign_keys: [],
          permissions: [],
        },
      ],
    });
  }

  // console.log("dbschema", JSON.stringify(dbSchema));
  // This seems to work
  subzero = new Subzero(dbType, dbSchema);
}

function fmtMySqlEnv(env: QueryEnv): Statement {
  const parameters: any[] = [];
  const queryParts: string[] = [];
  env.forEach(([key, value], _i) => {
    queryParts.push(`@${key} = ?`);
    parameters.push(value);
  });
  const query = `set ${queryParts.join(", ")}`;
  return { query, parameters };
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
  const { query, parameters } = await subzero.fmtStatement(
    schema,
    `${urlPrefix}/`,
    role,
    request,
    queryEnv
  );

  let result: Record<string, unknown>[];
  const db = await subzeroDbPool.getConnection();
  try {
    // I don't think this works?
    // await Promise.all([
    //   // connection.execute("set role ?", [role]),
    // ]);

    // console.log("envQuery", envQuery);
    // console.log("envParameters", envParameters);
    const envRes = await db.query(envQuery, envParameters);
    // console.log("envRes", envRes);
    // console.log("query", query);
    // console.log("parameters", parameters);
    // FIXME: This fails
    result = (await db.query(query, parameters)).rows;
  } catch (e) {
    console.error(
      `Error performing query ${query} with parameters ${parameters}`,
      e
    );
    throw e;
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
