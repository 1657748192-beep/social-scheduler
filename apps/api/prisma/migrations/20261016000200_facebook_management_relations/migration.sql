ALTER TABLE "facebook_management_connections" ADD CONSTRAINT "facebook_management_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_management_connections" ADD CONSTRAINT "facebook_management_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_managed_pages" ADD CONSTRAINT "facebook_managed_pages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "facebook_management_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_managed_page_businesses" ADD CONSTRAINT "facebook_managed_page_businesses_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_management_oauth_states" ADD CONSTRAINT "facebook_management_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_management_oauth_states" ADD CONSTRAINT "facebook_management_oauth_states_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_management_page_selections" ADD CONSTRAINT "facebook_management_page_selections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_management_page_selections" ADD CONSTRAINT "facebook_management_page_selections_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_interaction_events" ADD CONSTRAINT "facebook_interaction_events_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_interaction_comments" ADD CONSTRAINT "facebook_interaction_comments_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_interaction_threads" ADD CONSTRAINT "facebook_interaction_threads_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_interaction_messages" ADD CONSTRAINT "facebook_interaction_messages_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "facebook_interaction_send_attempts" ADD CONSTRAINT "facebook_interaction_send_attempts_managedPageId_fkey" FOREIGN KEY ("managedPageId") REFERENCES "facebook_managed_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
