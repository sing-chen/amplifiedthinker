-- Down-path for 20260819080000_delete_own_account.sql
--
-- Destroys no data. Dropping the function removes the site's delete control and
-- nothing else - accounts already deleted through it stay deleted, because the
-- deletion was a real DELETE against auth.users and not a flag.
--
-- The account page calls this by name and handles a missing function as an
-- error the user can see, so running this leaves the button present and failing
-- rather than the page broken. If the intent is to withdraw the feature rather
-- than debug it, remove the panel from src/pages/account.astro in the same
-- change.

drop function if exists public.delete_own_account();
