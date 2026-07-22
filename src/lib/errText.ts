import type { TFn } from "../i18n/types";
import type { ApiError } from "./api";

// Server-side validation errors come back as a `code`; this maps them to
// the current language. Upstream/network error text (res.error) passes
// through untranslated since it originates outside our locale files.
export function errText(t: TFn, res: ApiError): string | undefined {
  switch (res.code) {
    case "missing_key":
      return t("js.err.missingKey");
    case "unknown_product":
      return t("js.err.unknownProduct", { product: res.product });
    case "unknown_member_type":
      return t("js.err.unknownMemberType", { memberType: res.memberType });
    case "missing_key_id":
      return t("js.err.missingKeyId");
    case "empty_payload":
      return t("js.err.emptyPayload");
    case "parse_error":
      return t("js.parseError");
    default:
      return res.error;
  }
}
