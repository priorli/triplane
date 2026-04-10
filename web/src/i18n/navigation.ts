import { createNavigation } from "next-intl/navigation";
import { routing } from "./config";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
