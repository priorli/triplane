import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center min-h-screen">
      <SignIn />
    </main>
  );
}
