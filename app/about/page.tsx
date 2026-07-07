import type { Metadata } from "next";
import AboutTamilCard from "@/components/AboutTamilCard";

/**
 * "The Living Language": an educational intro about Tamil itself, shown
 * before the Soul Letters intro. Viewing it unlocks the Soul Letters intro.
 */

export const metadata: Metadata = {
  title: "About Tamil · Serpent Alphabet",
};

export default function AboutPage() {
  return <AboutTamilCard />;
}
