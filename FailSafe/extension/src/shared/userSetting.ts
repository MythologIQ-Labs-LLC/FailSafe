/**
 * userSetting — read a machine-scoped setting from the user level only
 * (v6.0.8 lane A). VS Code already ignores workspace values of a setting
 * declared `"scope": "machine"`; reading `inspect(key).globalValue` makes that
 * hold even where it would not filter them.
 */

/** The user-level value, or `fallback` when the user has not set one. */
export function userLevelValue<T>(inspected: { globalValue?: T } | undefined, fallback: T): T {
  const v = inspected?.globalValue;
  return v === undefined ? fallback : v;
}
