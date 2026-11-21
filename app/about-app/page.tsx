import type { Metadata } from "next";
import AboutAppCard from "@/components/AboutAppCard";

export const metadata: Metadata = {
  title: "About · TamiLearn",
};

export default function AboutAppPage() {
  return <AboutAppCard />;
}
