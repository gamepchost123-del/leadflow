/**
 * Centralized constants for status labels, badge classes, and category badges.
 * Used across dashboard, leads, and outreach pages.
 */

export const STATUS_MAP: Record<string, { label: string; emoji: string; badgeClass: string }> = {
  NEW:        { label: 'Nieuw',     emoji: '🆕', badgeClass: 'badge-new' },
  CONTACTED:  { label: 'Benaderd',  emoji: '📧', badgeClass: 'badge-contacted' },
  INTERESTED: { label: 'Interesse', emoji: '✅', badgeClass: 'badge-interested' },
  REJECTED:   { label: 'Afgewezen', emoji: '❌', badgeClass: 'badge-rejected' },
  CUSTOMER:   { label: 'Klant',     emoji: '🏆', badgeClass: 'badge-customer' },
};

export const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Alles', emoji: '📋' },
  ...Object.entries(STATUS_MAP).map(([value, { label, emoji }]) => ({
    value,
    label,
    emoji,
  })),
];

export function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export function getStatusBadgeClass(status: string): string {
  return STATUS_MAP[status]?.badgeClass ?? 'badge-new';
}

export const CATEGORY_CONFIG: Record<string, { label: string; shortLabel: string; className: string }> = {
  RECRUITMENT: {
    label: '🏢 Recruitment',
    shortLabel: '🏢',
    className: 'bg-[rgba(59,130,246,0.15)] text-[var(--accent-blue)]',
  },
  HORECA_WINE: {
    label: '🍷 Horeca',
    shortLabel: '🍷',
    className: 'badge-horeca',
  },
};

export function getCategoryBadge(category: string) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.RECRUITMENT;
}
