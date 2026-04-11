import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AuthenticatedHomePage() {
  const t = await getTranslations("common");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("home.welcome")}</h1>
      <p className="text-muted-foreground">{t("home.description")}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("home.itemsCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("home.itemsCardBody")}
            </p>
            <Link
              href="/items"
              className="text-sm text-primary underline underline-offset-4 mt-2 inline-block"
            >
              {t("home.itemsCardLink")} →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("home.apiDocsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("home.apiDocsBody")}
            </p>
            <a
              href="/api/v1/docs"
              className="text-sm text-primary underline underline-offset-4 mt-2 inline-block"
            >
              /api/v1/docs
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
