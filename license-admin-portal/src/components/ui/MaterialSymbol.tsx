import { Icon } from "@iconify/react";

function toKebab(raw: string) {
  return raw.replace(/_/g, "-");
}

const NO_OUTLINE_SUFFIX = new Set([
  "search",
  "wifi",
  "language",
  "alternate-email",
  "code",
  "target",
  "arrow-forward",
  "update",
  "radar",
  "expand-more",
  "flight",
  "stacked-line-chart",
  "arrow-back",
  "close",
  "logout",
  "bar-chart",
  "hourglass-empty",
  "history",
  "block",
  "verified-user",
]);

export function MaterialSymbol({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  const k = toKebab(name);
  const icon =
    filled || NO_OUTLINE_SUFFIX.has(k) ? `material-symbols:${k}` : `material-symbols:${k}-outline`;
  return <Icon icon={icon} className={className} width="1em" height="1em" aria-hidden />;
}
