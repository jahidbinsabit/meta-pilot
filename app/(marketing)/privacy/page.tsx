export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">
        We store only what is needed to provide the service: your account email, credit balance,
        generation history, and analytics connections. Your images are processed transiently and
        stored in your private S3 prefix.
      </p>
    </div>
  );
}
