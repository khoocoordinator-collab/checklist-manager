# Changelog

## [Unreleased]

### Added
- Supervisor validation requirement configurable per template (`requires_supervisor` field)
- Admin enforces supervisor team selection when creating instances for templates that require validation
- Form validation prevents marking checklists as completed without supervisor sign-off when required
- Template selection form for supervisor team assignment during instance generation

### Added
- Multi-outlet support: One outlet can have many teams, one team belongs to one outlet
- Outlet model with name and location fields
- Outlet displayed in header: "Outlet Name — Team Name"
- Outlet admin interface for managing outlets

### Fixed
- Sync state bug - incomplete checklists now persist after sync
- Button text visibility on white backgrounds

### Changed
- Removed redundant "Completed By" field (now captured from signature popup)
- Enhanced progress bar with visual completion card UI
- Team.passcode now unique across all teams (required for single-passcode login)

## [1.0.0] - 2026-02-18
### Added
- Initial release: Django + React checklist manager
- Offline completion with localStorage
- Digital signature capture
- Team-based passcode login
- Checkbox, number, and text response types
