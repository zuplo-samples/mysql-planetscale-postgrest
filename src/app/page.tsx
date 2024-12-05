"use client";

import { PostgrestClient } from "@supabase/postgrest-js";
import { useState } from "react";
// import Image from "next/image";

// Replace the NEXT_PUBLIC_API_URL with your Zuplo gateway URL (or your Vercel URL directly
// if you don't want built-in protection or caching)
const REST_URL = `${process.env.NEXT_PUBLIC_API_URL}/api`;

interface PostgrestResponse {
  body: string;
  constraints_satisfied: boolean;
  page_total: number;
  response_headers: Headers | null;
  response_status: number | null;
  total_result_set: number;
}

const SELECT_CODE_SAMPLE = `const { data, error } = await postgrest
      .from("products")
      .select("*")
      .order("id", { ascending: false });`;
const getInsertCodeSample = (
  name: string
) => `const { data, error } = await postgrest.from("products").insert({
      name: ${name},
      image_url: "https://example.com/500x500",
      category_id: 1,
    });`;

export default function Home() {
  const [mysqlData, setMysqlData] = useState<string>();
  const [error, setError] = useState<string>();
  const [codeSample, setCodeSample] = useState<string>();
  const handleFetchClick = async () => {
    performFetch();
    setCodeSample(SELECT_CODE_SAMPLE);
  };
  const performFetch = async () => {
    const postgrest = new PostgrestClient(REST_URL);
    const { data, error } = await postgrest
      .from("products")
      .select("*")
      .order("id", { ascending: false });
    if (data) {
      setMysqlData(
        JSON.parse((data as unknown as PostgrestResponse[])[0].body)
      );
      setError(undefined);
    }
    if (error) {
      setError(JSON.stringify(error, null, 2));
      setMysqlData(undefined);
    }
  };
  const handleInsertClick = async () => {
    const randomName = Math.random().toString(36).substring(7);
    const postgrest = new PostgrestClient(REST_URL, {
      headers: {
        Prefer: "return=minimal",
      },
    });
    const { data, error } = await postgrest.from("products").insert({
      name: randomName,
      image_url: "https://example.com/500x500",
      category_id: 1,
    });
    if (data) {
      performFetch();
    }
    if (error) {
      setError(JSON.stringify(error, null, 2));
    }
    setCodeSample(getInsertCodeSample(randomName));
  };
  return (
    <div className="min-h-screen font-[family-name:var(--font-geist-sans)] flex p-8 items-center flex-col gap-y-4">
      <header className="text-4xl font-medium text-[#02758f]">
        <span className="text-[#02758f]">My</span>
        <span className="text-[#f29111]">SQL</span> PostgREST API Demo
      </header>
      <div>
        A Supabase-like API DevX with Mysql and PostgREST.{" "}
        <a
          className="text-blue-500 hover:text-blue-600"
          target="_blank"
          href="https://github.com/zuplo-samples/mysql-postgrest"
        >
          Source
        </a>
      </div>

      <div className="flex gap-x-4">
        <button
          onClick={handleFetchClick}
          className="bg-white text-black rounded-lg w-fit font-mono p-4 hover:bg-[#02758f] hover:text-white"
        >
          Fetch Table Data
        </button>
        <button
          onClick={handleInsertClick}
          className="bg-white text-black rounded-lg w-fit font-mono p-4 hover:bg-[#f29111] hover:text-white"
        >
          Add Random Data
        </button>
      </div>
      {codeSample ? (
        <div className="w-full">
          <h2 className="text-2xl font-medium ">Code Sample</h2>
          <div className="bg-slate-800 text-white font-mono p-4 rounded-lg shadow-md w-full max-h-[50vh] overflow-auto">
            <pre className="overflow-auto">{codeSample}</pre>
          </div>
        </div>
      ) : null}
      {mysqlData ? (
        <div className="w-full">
          <h2 className="text-2xl font-medium ">Data</h2>

          <div className="bg-slate-800 text-white font-mono p-4 rounded-lg shadow-md w-full max-h-[50vh] overflow-auto">
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(mysqlData, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
      {error && (
        <div className="bg-red-100 p-4 rounded-lg shadow-md w-full text-red-700">
          <pre className="whitespace-pre-wrap break-words">{error}</pre>
        </div>
      )}
      {/* <footer className="w-full justify-self-end mt-8">
        <div className="flex justify-center text-xl pb-3">BUILT WITH</div>
        <div className="flex gap-x-8 items-center w-full justify-center flex-wrap">
          <Image src="/vercel.svg" alt="Vercel Logo" width={32} height={32} />
          <Image
            src="/mysql-logo-dark-mono.svg"
            alt="Mysql Logo"
            width={78}
            height={32}
          />
          <Image src="/zuplo.svg" alt="Zuplo Logo" width={78} height={32} />
          <Image src="/next.svg" alt="NextJS Logo" width={78} height={32} />
          <Image src="/subzero.png" alt="Subzero Logo" width={40} height={40} />
        </div>
      </footer> */}
    </div>
  );
}
