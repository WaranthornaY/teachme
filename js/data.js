const DEFAULT_DB={
users:[
{id:"teacher1",realName:"Demo Teacher",password:"teacher123",role:"teacher",joined:"2026-08-01"},
{id:"student1",realName:"Demo Student",password:"student123",role:"student",joined:"2026-08-01"}
],
courses:[
{id:"web",title:"Web Development Basics",category:"Technology",level:"Beginner",description:"Learn HTML, CSS and JavaScript from the ground up.",teacherId:"teacher1",published:true,
lessons:[
{id:"web1",title:"Welcome to the course",description:"Course introduction and learning roadmap.",video:"",quiz:{questions:[{q:"What does HTML mainly define?",options:["Page structure","Internet speed","Computer power","Passwords"],answer:0}]}},
{id:"web2",title:"HTML Fundamentals",description:"Create the structure of modern web pages.",video:"",quiz:{questions:[{q:"Which tag creates a paragraph?",options:["<p>","<img>","<table>","<br>"],answer:0}]}},
{id:"web3",title:"CSS Fundamentals",description:"Style pages with layout, color and typography.",video:"",quiz:{questions:[{q:"Which property changes text color?",options:["color","paint","text-color","font-color"],answer:0}]}},
{id:"web4",title:"JavaScript Basics",description:"Make pages interactive.",video:"",quiz:{questions:[{q:"JavaScript is commonly used for?",options:["Interactivity","Electricity","Cables","Hardware"],answer:0}]}}
]},
{id:"design",title:"Digital Design Starter",category:"Design",level:"Beginner",description:"Learn the foundations of modern digital design.",teacherId:"teacher1",published:true,
lessons:[
{id:"d1",title:"Design Principles",description:"Layout, hierarchy and spacing.",video:"",quiz:{questions:[{q:"What guides attention through a design?",options:["Visual hierarchy","Random placement","Noise","Broken layout"],answer:0}]}},
{id:"d2",title:"Color and Typography",description:"Use color and type effectively.",video:"",quiz:{questions:[{q:"Typography is mainly about?",options:["Text design","Networking","Video","Hardware"],answer:0}]}}
]}],
enrollments:[{userId:"student1",courseId:"web"}],
progress:{"student1:web":["web1"]},
quizScores:{},reviews:[],certificates:[]
};
