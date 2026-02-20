import { redirect } from "next/navigation";

export default function Home() {
  // Send users to the login page by default.
  redirect("/login");
}
