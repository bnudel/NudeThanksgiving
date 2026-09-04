import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Force the site to re-read the spreadsheet immediately instead of waiting for
 * the scheduled revalidation. Visit /api/refresh after making a sheet edit.
 */
export async function GET() {
  revalidatePath("/");
  return NextResponse.redirect(
    new URL("/", process.env.SITE_URL ?? "http://localhost:3000"),
    { status: 303 },
  );
}
