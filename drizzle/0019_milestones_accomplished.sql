-- Drop the old "milestones created" totals. This column now counts milestones marked complete.
UPDATE `projects` SET `milestones_created` = 0;
