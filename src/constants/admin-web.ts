// Shared responsive breakpoints + title suffix for the web admin panel.
export const AdminBreakpoints = { tablet: 700, wide: 1024 } as const;
export const ADMIN_TITLE_SUFFIX = ' · KwikServe Admin';
/**
 * Maximum width of the admin page body. Admin tables are desktop-first and wider than the
 * mobile-oriented `MaxContentWidth` (800) used by customer screens; keeping a separate constant
 * leaves the mobile layouts untouched.
 */
export const AdminMaxContentWidth = 1440;
