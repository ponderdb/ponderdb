import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";
import { ValidationError } from "@ponderdb/core";

export function teamsRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store } = deps;

  // List user's teams
  router.get("/", async (c) => {
    const userId = c.get("userId") || "local";
    const teams = await store.listUserTeams(userId);
    return c.json({ teams });
  });

  // Create team
  router.post("/", async (c) => {
    const userId = c.get("userId") || "local";
    const body = await c.req.json();
    if (!body.name) throw new ValidationError("name is required");

    const team = await store.createTeam({ name: body.name, slug: body.slug }, userId);
    return c.json(team, 201);
  });

  // Get team by slug
  router.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const team = await store.getTeamBySlug(slug);
    if (!team) return c.json({ error: { code: "TEAM_NOT_FOUND", message: `Team not found: ${slug}` } }, 404);

    const members = await store.listTeamMembers(team.id);
    return c.json({ ...team, members });
  });

  // List team members
  router.get("/:slug/members", async (c) => {
    const slug = c.req.param("slug");
    const team = await store.getTeamBySlug(slug);
    if (!team) return c.json({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } }, 404);

    const members = await store.listTeamMembers(team.id);
    return c.json({ members });
  });

  // Add team member
  router.post("/:slug/members", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json();
    if (!body.email) throw new ValidationError("email is required");

    const team = await store.getTeamBySlug(slug);
    if (!team) return c.json({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } }, 404);

    const user = await store.getUserByEmail(body.email);
    if (!user) return c.json({ error: { code: "USER_NOT_FOUND", message: `User not found: ${body.email}` } }, 404);

    const role = body.role || "member";
    const member = await store.addTeamMember(team.id, user.id, role);
    return c.json(member, 201);
  });

  // Update member role
  router.put("/:slug/members/:userId", async (c) => {
    const slug = c.req.param("slug");
    const memberId = c.req.param("userId");
    const body = await c.req.json();
    if (!body.role) throw new ValidationError("role is required");

    const team = await store.getTeamBySlug(slug);
    if (!team) return c.json({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } }, 404);

    const member = await store.updateTeamMemberRole(team.id, memberId, body.role);
    return c.json(member);
  });

  // Remove team member
  router.delete("/:slug/members/:userId", async (c) => {
    const slug = c.req.param("slug");
    const memberId = c.req.param("userId");

    const team = await store.getTeamBySlug(slug);
    if (!team) return c.json({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } }, 404);

    const removed = await store.removeTeamMember(team.id, memberId);
    if (!removed) return c.json({ error: { code: "MEMBER_NOT_FOUND", message: "Member not found" } }, 404);
    return c.json({ removed: true });
  });

  // Delete team
  router.delete("/:slug", async (c) => {
    const slug = c.req.param("slug");
    const team = await store.getTeamBySlug(slug);
    if (!team) return c.json({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } }, 404);

    const deleted = await store.deleteTeam(team.id);
    if (!deleted) return c.json({ error: { code: "TEAM_NOT_FOUND", message: "Team not found" } }, 404);
    return c.json({ deleted: true });
  });

  return router;
}
