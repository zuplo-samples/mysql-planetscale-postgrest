export const maxDuration = 120; // This function can run for a maximum of 5 seconds

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function example() {
  console.log("Start");

  // Sleep for 3 seconds
  await sleep(3000);

  console.log("End");
}

example();

export const GET = async () => {
  await sleep(32000);
  return new Response("Hello World!");
};
