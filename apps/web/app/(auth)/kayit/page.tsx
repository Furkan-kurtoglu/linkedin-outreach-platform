import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = { title: "Kayıt" };

export default function Page() {
  return <AuthForm mode="up" />;
}
