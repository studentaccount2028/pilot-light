// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse } from "next/server";
import { ValidationError } from "./households";

export const dynamic = "force-dynamic";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Wraps a route handler so a thrown error becomes a JSON error, never a blank 500 page.
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ValidationError) return bad(err.message, 422);
      if (err instanceof SyntaxError) return bad("Request body was not valid JSON.");
      console.error(err);
      return bad("Something went wrong on our side. Please try again.", 500);
    }
  };
}
