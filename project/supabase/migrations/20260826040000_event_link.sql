/*
  # Let event organizers attach a link (Zoom/registration/info page)

  `events` had no field for a URL at all, so there was nowhere to put a
  video-call link, an external registration form, or a "learn more" page
  when creating an event. This adds a plain `link` text column,
  defaulting to '' like every other optional text field on this table.
*/

ALTER TABLE events ADD COLUMN IF NOT EXISTS link text DEFAULT '';
