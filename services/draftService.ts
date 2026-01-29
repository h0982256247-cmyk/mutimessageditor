
import { supabase } from '../supabaseClient';
import { Project, Folder } from '../types';

export const draftService = {
    // --- Folders ---
    async getFolders() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('rm_folders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data as Folder[];
    },

    async createFolder(name: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('rm_folders')
            .insert({
                user_id: user.id,
                name
            })
            .select()
            .single();

        if (error) throw error;
        return data as Folder;
    },

    async updateFolder(id: string, name: string) {
        const { error } = await supabase
            .from('rm_folders')
            .update({ name, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;
    },

    async deleteFolder(id: string) {
        const { error } = await supabase
            .from('rm_folders')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // --- Drafts (Projects) ---
    async getDrafts() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return []; // Allow viewing app as guest but return empty

        const { data, error } = await supabase
            .from('rm_drafts')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;

        // Transform DB schema to Project type
        return data.map((d: any) => ({
            id: d.id,
            name: d.name,
            status: d.status,
            scheduledAt: d.scheduled_at,
            folderId: d.folder_id,
            menus: d.data.menus, // JSONB data contains the menus array
            updatedAt: d.updated_at
        })) as Project[];
    },

    async saveDraft(project: Project) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('請先登入以儲存草稿');

        // Check if draft exists (conceptually)
        // In our App.tsx, we generate random UUIDs for new drafts frontend-side.
        // If we want to upsert, we can try to use the same ID.
        // However, Supabase ID is UUID default gen_random_uuid().
        // Strategy: We will use UPSERT on the ID column.

        // Transform Project to DB schema
        const payload = {
            id: project.id,
            user_id: user.id,
            name: project.name,
            status: project.status,
            scheduled_at: project.scheduledAt || null,
            folder_id: project.folderId || null,
            data: { menus: project.menus },
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('rm_drafts')
            .upsert(payload)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteDraft(id: string) {
        const { error } = await supabase
            .from('rm_drafts')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
