import type { Audit, Lead, Member, Message, Platform, WorkspaceState } from './domain';

const HOUR = 3_600_000;
const DAY = HOUR * 24;

/** All organizations, people, URLs, measurements and conversations here are fictional. */
export function createDemoState(): WorkspaceState {
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  const members: Member[] = [
    { id: 'member_maya', userId: 'demo_maya', name: 'Maya Chen', email: 'maya@highlevel.example', role: 'admin', status: 'active', createdAt: ago(60) },
    { id: 'member_jordan', userId: 'demo_jordan', name: 'Jordan Lee', email: 'jordan@highlevel.example', role: 'member', status: 'active', createdAt: ago(45) },
    { id: 'member_alex', userId: 'demo_alex', name: 'Alex Morgan', email: 'alex@highlevel.example', role: 'member', status: 'active', createdAt: ago(38) },
    { id: 'member_sarah', userId: 'demo_sarah', name: 'Sarah Wilson', email: 'sarah@highlevel.example', role: 'member', status: 'active', createdAt: ago(35) },
  ];
  const rows: [string,string,string,string,string,Platform,Lead['status'],number,number][] = [
    ['Emma Brooks','Bloom Studio','Design & creative','Austin, TX','bloom-studio','Instagram','Replied',1,2.8],
    ['Oliver Reed','Form & Field','Home & interiors','London, UK','form-and-field','Instagram','Qualified',2,4.2],
    ['Sophia Park','Northstar Dental','Healthcare','Toronto, CA','northstar-dental','Facebook','Contacted',3,5.1],
    ['James Miller','Common Ground Coffee','Food & beverage','Melbourne, AU','common-ground','Instagram','New',1,0.2],
    ['Isabella Hayes','Evergreen Wellness','Health & wellness','Austin, TX','evergreen-wellness','Facebook','Replied',2,6.4],
    ['Noah Bennett','Summit Financial','Professional services','New York, NY','summit-financial','LinkedIn','Contacted',0,8.1],
    ['Amelia Scott','Studio Meridian','Design & creative','Los Angeles, CA','studio-meridian','Instagram','New',3,0.8],
    ['Lucas Martin','Harbor & Home','Real estate','San Diego, CA','harbor-and-home','Facebook','Qualified',1,12.2],
    ['Mia Foster','Brightside Learning','Education','London, UK','brightside-learning','Website','Contacted',2,3.5],
    ['Ethan Clarke','Orbit Analytics','Software & technology','San Francisco, CA','orbit-analytics','X','New',3,1.1],
    ['Charlotte Lane','Terra Botanics','Beauty & skincare','Portland, OR','terra-botanics','Instagram','Won',1,18.4],
    ['Henry Davis','Atlas Architecture','Design & creative','Chicago, IL','atlas-architecture','LinkedIn','Replied',0,9.7],
    ['Ava Stone','Sunday Market','Retail & ecommerce','Brooklyn, NY','sunday-market','Instagram','New',2,0.4],
    ['Leo Williams','Cedar Fitness','Health & wellness','Manchester, UK','cedar-fitness','Facebook','Contacted',3,2.2],
    ['Grace Cooper','Lumen Legal','Professional services','Dubai, AE','lumen-legal','Website','New',0,1.8],
    ['Jack Turner','Wildwood Retreats','Travel & hospitality','Vancouver, CA','wildwood-retreats','Instagram','Qualified',2,22.3],
  ];
  const leads: Lead[] = rows.map((row, index) => {
    const [name, company, industry, location, slug, platform, status, owner, created] = row;
    const website = `https://${slug}.example`;
    // .example URLs prevent the demo from implying that any real social profile was verified.
    const profileUrl = platform === 'Website' ? website : `https://${platform.toLowerCase()}.example/${slug}`;
    return {
      id: `lead_${index + 1}`, name, company, industry, location, website,
      email: `hello@${slug}.example`, platform, profileUrl, socialLinks: { [platform]: profileUrl },
      status, ownerId: members[owner].id, createdAt: ago(created),
      notes: status === 'New' ? 'Sample lead. Review the website and choose a relevant opening message.' : 'Sample research: a focused website review could be a useful conversation starter.',
    };
  });
  const messages: Message[] = [];
  let sequence = 1;
  const message = (leadIndex: number, daysAgo: number, body: string, direction: Message['direction'] = 'outbound', status: Message['status'] = 'logged') => {
    const lead = leads[leadIndex];
    messages.push({ id: `message_${sequence++}`, leadId: lead.id, memberId: lead.ownerId, platform: lead.platform, body, direction, status, createdAt: ago(daysAgo) });
  };
  message(0, 2.6, 'Hi Emma! I loved the visual direction at Bloom Studio. I noticed a few opportunities to make your service pages easier to find. Would a short website review be useful?');
  message(0, 0.08, 'Hi Jordan, thanks for reaching out! A short review would be great. Could you share what you had in mind?', 'inbound', 'received');
  message(0, 0.03, 'Absolutely, Emma. I can put together a short review of your homepage and local search presence, then send over three practical suggestions.', 'outbound', 'draft');
  message(1, 4, 'Hi Oliver, your recent collection caught my eye. I have a few ideas for improving how customers find the collection pages. Open to a quick overview?');
  message(1, 3.1, 'Yes, please. We are planning a website refresh next month, so the timing is good.', 'inbound', 'received');
  message(1, 2.9, 'Great timing. I will focus the review on your product pages and mobile experience.');
  message(2, 4.8, 'Hi Sophia, I help local clinics improve their website and business listing. May I share a few observations about your online presence?');
  message(2, 1.4, 'Following up on my note, Sophia. Happy to share the review whenever it is useful.');
  message(4, 6, 'Hi Isabella, I came across Evergreen Wellness and wanted to share a few ideas for your local visibility. Would a brief review help?');
  message(4, 0.3, 'Thanks, Alex. We have been thinking about local search. Please send the details.', 'inbound', 'received');
  message(5, 7.9, 'Hi Noah, I am putting together a few website observations for professional services firms. Would you be interested in a quick review?');
  message(5, 4.6, 'Just following up, Noah. The review would cover your key service pages and enquiry journey.');
  message(7, 11.8, 'Hi Lucas, your property photography looks excellent. Could I share a couple of website improvement ideas?');
  message(7, 10.9, 'Sure, that would be helpful. We are especially interested in getting more local enquiries.', 'inbound', 'received');
  message(7, 5.4, 'Thanks, Lucas. I have outlined a few local search opportunities for our call.');
  message(8, 3.2, 'Hi Mia, I noticed Brightside has a great range of courses. Would a short review of the course pages be useful?');
  message(9, 0.7, 'Hi Ethan, I have a few ideas for helping more teams discover Orbit. Would a short website review be useful?', 'outbound', 'draft');
  message(10, 18, 'Hi Charlotte, the Terra Botanics range looks lovely. Would you be open to a few ideas for making the collection easier to discover?');
  message(10, 16.2, 'Yes, we would. Could you send over your approach?', 'inbound', 'received');
  message(10, 15.8, 'Of course. I will prepare a small scope around collection pages, local visibility and the enquiry flow.');
  message(10, 12.6, 'The scope looks good. Let us move ahead.', 'inbound', 'received');
  message(11, 9.4, 'Hi Henry, I enjoyed looking through the Atlas projects. May I send a short review of how the project pages appear in search?');
  message(11, 1.8, 'Hi Maya, yes please. We would appreciate another perspective.', 'inbound', 'received');
  message(13, 1.9, 'Hi Leo, I help local studios improve their website and online presence. Would you like a quick review for Cedar Fitness?');
  message(15, 22, 'Hi Jack, Wildwood looks like a fantastic retreat. Could I share a few ideas for improving how guests discover your packages?');
  message(15, 20.6, 'Yes, thank you. We are preparing for next season, so that would help.', 'inbound', 'received');
  message(15, 19.8, 'I will focus on your booking pages and location information.');
  const audits: Audit[] = [
    { id:'audit_1', leadId:'lead_1', type:'SEO', status:'complete', score:72, summary:'Sample audit: a useful foundation, with room to improve page descriptions and image text.', createdAt:ago(1.5), checks:[
      {label:'Page title',status:'pass',detail:'Sample: a descriptive homepage title is present.'},
      {label:'Meta description',status:'warn',detail:'Sample: the description could be more specific to the studio’s services.'},
      {label:'Image descriptions',status:'fail',detail:'Sample: 4 images are missing alternative text.'},
      {label:'Mobile viewport',status:'pass',detail:'Sample: the page declares a mobile viewport.'},
    ] },
    { id:'audit_2', leadId:'lead_2', type:'SEO', status:'complete', score:84, summary:'Sample audit: strong page basics; refine image text and structured data.', createdAt:ago(2.1), checks:[
      {label:'Page title',status:'pass',detail:'Sample: a unique page title is present.'},
      {label:'Canonical URL',status:'pass',detail:'Sample: the page declares a canonical URL.'},
      {label:'Structured data',status:'warn',detail:'Sample: business structured data needs review.'},
    ] },
    { id:'audit_3', leadId:'lead_5', type:'Google Business', status:'manual', score:null, summary:'Sample review checklist. No live Google Business Profile data has been retrieved.', createdAt:ago(0.8), checks:[
      {label:'Business listing',status:'unknown',detail:'Verify the listing URL, name, address and phone number with the business.'},
      {label:'Categories and opening hours',status:'unknown',detail:'Review the authorized business listing and record evidence.'},
      {label:'Reviews and responses',status:'unknown',detail:'Check current reviews and response quality using an authorized source.'},
    ] },
    { id:'audit_4', leadId:'lead_6', type:'AI visibility', status:'manual', score:null, summary:'Sample evidence checklist. Visibility has not been measured.', createdAt:ago(3), checks:[
      {label:'Query and provider',status:'unknown',detail:'Record the exact query, AI provider, date and location.'},
      {label:'Brand mentions and citations',status:'unknown',detail:'Attach a source or authorized report before assessing visibility.'},
    ] },
  ];
  return {
    workspace:{id:'demo_workspace',name:'Highlevel Leads'},currentMember:members[0],members,leads,messages,audits,
    notifications:[
      {id:'notification_1',title:'New sample reply from Bloom Studio',detail:'Emma is interested in a short website review.',read:false,createdAt:ago(0.08),leadId:'lead_1'},
      {id:'notification_2',title:'New sample reply from Evergreen Wellness',detail:'Isabella would like to learn more about local search.',read:false,createdAt:ago(0.3),leadId:'lead_5'},
      {id:'notification_3',title:'Sample review completed',detail:'Bloom Studio’s sample SEO review is ready to explore.',read:true,createdAt:ago(1.5),leadId:'lead_1'},
    ],
    accounts:[
      {id:'account_1',memberId:'member_maya',platform:'Instagram',handle:'@highlevel.maya',profileUrl:'https://instagram.example/highlevel.maya',status:'profile_saved'},
      {id:'account_2',memberId:'member_jordan',platform:'Facebook',handle:'Highlevel Jordan',profileUrl:'https://facebook.example/highlevel.jordan',status:'profile_saved'},
      {id:'account_3',memberId:'member_alex',platform:'LinkedIn',handle:'Alex Morgan',profileUrl:'https://linkedin.example/in/alex-morgan',status:'profile_saved'},
    ],
  };
}

const id = (prefix:string) => `${prefix}_${crypto.randomUUID()}`;
const platforms: Platform[] = ['Instagram','Facebook','LinkedIn','X','Website'];

// An intentionally local reducer for the labelled sample workspace. Real records use the API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyDemoAction(state: WorkspaceState, action: any): WorkspaceState {
  const next = structuredClone(state);
  const currentMember = next.currentMember;
  if (!currentMember) throw new Error('Select a workspace first.');
  const createdAt = new Date().toISOString();
  const canAccess = (lead:Lead) => currentMember.role === 'admin' || lead.ownerId === currentMember.id;
  const getLead = (leadId:string) => {
    const lead = next.leads.find(l => l.id === leadId && canAccess(l));
    if (!lead) throw new Error('Lead not found.');
    return lead;
  };
  const text = (value:unknown, fallback='') => typeof value === 'string' ? value.trim() : fallback;
  switch (action.action) {
    case 'addLead': {
      const source = action.lead ?? {};
      if (!text(source.name) || !text(source.company)) throw new Error('Contact name and company are required.');
      const ownerId = currentMember.role === 'admin' && next.members.some(m => m.id === source.ownerId) ? source.ownerId : currentMember.id;
      next.leads.unshift({id:id('lead'),name:text(source.name),company:text(source.company),industry:text(source.industry),location:text(source.location),website:text(source.website),email:text(source.email),platform:platforms.includes(source.platform)?source.platform:'Instagram',profileUrl:text(source.profileUrl),socialLinks:source.socialLinks ?? {},status:'New',ownerId,notes:text(source.notes),createdAt});
      break;
    }
    case 'updateLead': {
      const lead = getLead(action.id);
      const changes = action.changes ?? {};
      if (['New','Contacted','Replied','Qualified','Won'].includes(changes.status)) lead.status = changes.status;
      if (typeof changes.notes === 'string') lead.notes = changes.notes.trim();
      if (typeof changes.website === 'string') lead.website = changes.website.trim();
      if (changes.ownerId) {
        if (currentMember.role !== 'admin') throw new Error('Only admins can reassign leads.');
        if (!next.members.some(m => m.id === changes.ownerId)) throw new Error('Team member not found.');
        lead.ownerId = changes.ownerId;
      }
      break;
    }
    case 'inviteMember': {
      if (currentMember.role !== 'admin') throw new Error('Only admins can add team members.');
      const email = text(action.email).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !text(action.name)) throw new Error('A name and valid email are required.');
      if (next.members.some(m => m.email === email)) throw new Error('This email is already in the workspace.');
      next.members.push({id:id('member'),userId:null,name:text(action.name),email,role:action.role === 'admin'?'admin':'member',status:'invited',createdAt});
      break;
    }
    case 'saveMessage': {
      const lead = getLead(action.leadId);
      const body = text(action.body);
      if (!body) throw new Error('Write a message first.');
      const direction = action.direction === 'inbound'?'inbound':'outbound';
      const status = direction === 'inbound'?'received':action.status === 'logged'?'logged':'draft';
      next.messages.push({id:id('message'),leadId:lead.id,memberId:currentMember.id,platform:platforms.includes(action.platform)?action.platform:lead.platform,body,direction,status,createdAt});
      if (direction === 'inbound') {
        lead.status = 'Replied';
        next.notifications.unshift({id:id('notification'),title:`Reply recorded: ${lead.company}`,detail:`${currentMember.name} manually recorded a reply.`,read:false,createdAt,leadId:lead.id});
      } else if (status === 'logged' && lead.status === 'New') lead.status = 'Contacted';
      break;
    }
    case 'readNotifications':
      next.notifications = next.notifications.map(n => ({...n,read:true}));
      break;
    case 'saveAccount': {
      if (!platforms.includes(action.platform)) throw new Error('Choose a supported platform.');
      if (!text(action.handle)) throw new Error('A profile name or handle is required.');
      const existing = next.accounts.find(a => a.memberId === currentMember.id && a.platform === action.platform);
      if (existing) { existing.handle = text(action.handle); existing.profileUrl = text(action.profileUrl); existing.status = 'profile_saved'; }
      else next.accounts.push({id:id('account'),memberId:currentMember.id,platform:action.platform,handle:text(action.handle),profileUrl:text(action.profileUrl),status:'profile_saved'});
      break;
    }
    case 'addAudit': {
      const audit = action.audit as Audit;
      getLead(audit.leadId);
      next.audits.unshift({...audit,id:id('audit'),createdAt});
      break;
    }
    default: throw new Error('This sample action is not supported.');
  }
  return next;
}
