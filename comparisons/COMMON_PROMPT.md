Read the description of every PR in the associated github project, except for #1.
Each PR should contain the prompts used to create the code in the project.
Using _only_ the prompts in the PRs, create a plan for implementing the project from scratch in this folder.
Do not look at existing code, tests or documentation. Everything you need should be in the PR description and follow up comments.
When done, I will start a new agent with only your plan as input, so make sure to write the plan to a file called PLAN.md.
The shouldn't contain anything related to an AGENTS.md file or anything related to PRs.
The idea is to one-shot a new implementation in a single session, using nothing but the PLAN
