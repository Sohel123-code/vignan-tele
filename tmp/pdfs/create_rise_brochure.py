from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf/RISE_Technologies_Company_Brochure.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
FONT = Path('C:/Windows/Fonts')
for name, file in [('Regular','segoeui.ttf'),('Bold','segoeuib.ttf'),('Light','segoeuil.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT/file)))
W,H = 595.2756,841.8898
INK = '#101113'; ORANGE = '#FF7900'; GRAY = '#575B61'; PALE = '#F3F3F1'; LINE = '#DCDDD9'
c = canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
c.setTitle('RISE Technologies | Company Brochure')
c.setAuthor('RISE Technologies')
c.setSubject('Company profile, services, approach and contact details | Visakhapatnam')

def rect(x,y,w,h,color):
    c.setFillColor(HexColor(color)); c.rect(x,H-y-h,w,h,stroke=0,fill=1)

def poly(points,color):
    p=c.beginPath(); p.moveTo(points[0][0],H-points[0][1])
    for x,y in points[1:]: p.lineTo(x,H-y)
    p.close(); c.setFillColor(HexColor(color)); c.drawPath(p,fill=1,stroke=0)

def line(x,y,x2,y2,color=LINE,width=1):
    c.setStrokeColor(HexColor(color)); c.setLineWidth(width); c.line(x,H-y,x2,H-y2)

def text(t,x,y,size=11,font='Regular',color=INK):
    c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,H-y-size,t)

def label(t,x,y,color=GRAY,size=9):
    c.saveState(); c.setFillColor(HexColor(color)); ob=c.beginText(x,H-y-size); ob.setFont('Bold',size); ob.setCharSpace(1.7); ob.textOut(t); c.drawText(ob); c.restoreState()

def para(t,x,y,w,size=11,color=GRAY,leading=None,font='Regular'):
    style=ParagraphStyle('copy',fontName=font,fontSize=size,leading=leading or size*1.48,textColor=HexColor(color))
    p=Paragraph(t,style); _,h=p.wrap(w,H); p.drawOn(c,x,H-y-h); return h

def logo(x,y,w):
    # Place the original logo through a PDF clipping window, preserving the asset.
    img=ImageReader('C:/Users/SAMSUNG/Downloads/RISE Logo on White Background.png')
    iw,ih=img.getSize(); left,top,right,bottom=145,480,1115,790
    scale=w/(right-left); hh=(bottom-top)*scale
    c.saveState(); p=c.beginPath(); p.rect(x,H-y-hh,w,hh); c.clipPath(p,stroke=0,fill=0)
    c.drawImage(img,x-left*scale,H-y+top*scale-ih*scale,width=iw*scale,height=ih*scale)
    c.restoreState(); return hh

def header(section,num):
    rect(0,0,W,H,'#FFFFFF'); rect(42,35,5,17,ORANGE)
    label('RISE TECHNOLOGIES',58,37,INK); label(section,375,37,GRAY,8)
    line(42,69,W-42,69)

def footer(n,dark=False):
    color='#9DA2A9' if dark else GRAY
    line(42,791,W-42,791,'#34373C' if dark else LINE)
    text('RISE TECHNOLOGIES  /  VISAKHAPATNAM',42,805,8,color=color)
    text(f'{n:02d} / 04',510,805,8,color=color)

# PAGE 1 - cover
rect(0,0,W,H,'#FFFFFF')
label('COMPANY BROCHURE',42,32,GRAY)
poly([(500,0),(533,0),(W,62),(W,95)],ORANGE)
logo(81,82,433)
label('T E C H N O L O G I E S',174,226,INK,10)
rect(0,276,W,H-276,INK)
rect(42,318,42,5,ORANGE)
text('Driven by',42,348,43,'Bold','#FFFFFF')
text('Technology.',42,398,43,'Bold','#FFFFFF')
text('United by Vision.',42,459,30,'Light',ORANGE)
para('We turn ideas into practical digital solutions through engineering, design and intelligent technology.',42,530,345,13,'#CED1D5',19)
label('INNOVATE. BUILD. GROW.',42,637,'#FFFFFF',9)
para('AI & Machine Learning<br/>Web & Software Development<br/>Design, Analytics & Quality Assurance',42,665,310,11,'#B3B8BE',19)
poly([(410,603),(461,603),(W,737),(W,788)],'#26292D')
poly([(440,668),(482,668),(W,781),(W,823)],ORANGE)
footer(1,True); c.showPage()

# PAGE 2 - company story
header('OUR STORY',2)
label('CURIOUS MINDS. SHARED AMBITION.',42,98,ORANGE,9)
text('Meet the people',42,123,32,'Bold')
text('behind the RISE.',42,163,32,'Bold')
para('RISE Technologies is an emerging technology venture founded by six third-year BTech engineering students. United by curiosity, creativity and a shared vision, we build digital solutions for real-world challenges.',42,224,365,11.5,GRAY,17.5)
text('06',438,211,65,'Bold',ORANGE)
label('FOUNDERS',442,291,GRAY,7.5)
para('For us, technology begins with understanding people and the problems they face. We bring engineering, design and intelligent systems together to create useful, accessible digital experiences.',42,322,505,11.5,GRAY,17.5)

rect(42,405,247,157,INK); rect(305,405,248,157,PALE)
label('OUR MISSION',60,423,ORANGE)
para('Transform ideas into intelligent, practical and scalable solutions that create meaningful value for businesses and individuals.',60,455,211,11.5,'#FFFFFF',17)
label('OUR VISION',323,423,ORANGE)
para('Grow into a trusted technology company that unites innovation, engineering excellence and creativity to make a meaningful impact.',323,455,211,11.5,INK,17)

label('WHAT SETS US APART',42,595,GRAY)
for x,title,body in [
    (42,'One connected team','Engineering, design, AI and analytics working together.'),
    (217,'From idea to launch','Support across planning, development, testing and deployment.'),
    (392,'Built around you','Custom solutions shaped by your goals and requirements.')]:
    rect(x,623,25,3,ORANGE); text(title,x,637,12,'Bold'); para(body,x,662,155,10,GRAY,14.5)
line(42,729,553,729)
label('OUR VALUES',42,744,INK,8)
para('Innovation / Excellence / Integrity / Collaboration<br/>Continuous learning / Customer focus / Impact',169,741,384,9.5,GRAY,15)
footer(2); c.showPage()

# PAGE 3 - services
header('OUR SERVICES',3)
label('DESIGNED FOR REAL-WORLD NEEDS',42,98,ORANGE,9)
text('Ideas into solutions.',42,124,32,'Bold')
para('A connected set of capabilities to help you build, improve and grow your digital products.',42,175,475,12,GRAY,18)

services=[
('01','Artificial Intelligence','& Machine Learning','Intelligent applications, automation and customised models that help solve practical problems.','NLP / Computer vision / Predictive modelling'),
('02','Full-Stack Web','Development','Responsive web platforms with thoughtful interfaces, robust back-end systems and integrated data.','Web applications / APIs / Databases'),
('03','Software & Application','Development','Custom software that simplifies operations, improves productivity and supports your requirements.','Custom tools / Business applications'),
('04','UI/UX Design &','Digital Experiences','Clear, intuitive interfaces shaped by user needs, from early concepts to interactive prototypes.','User research / Wireframes / Prototypes'),
('05','Data Analytics &','Business Intelligence','Turn raw data into useful insights to understand trends, evaluate performance and inform decisions.','Data analysis / Visualisation / Reporting'),
('06','Quality Assurance &','Software Testing','Systematic testing, debugging and validation to improve functionality, reliability and performance.','Functional testing / Debugging / Validation')]
for i,(num,a,b,body,detail) in enumerate(services):
    x=42+(i%2)*263; y=239+(i//2)*171
    rect(x,y,248,157,PALE)
    text(num,x+15,y+11,11,'Bold',ORANGE)
    text(a,x+15,y+34,13,'Bold'); text(b,x+15,y+51,13,'Bold')
    para(body,x+15,y+77,218,10,GRAY,14)
    para(detail,x+15,y+129,218,7.7,GRAY,10,font='Bold')
footer(3); c.showPage()

# PAGE 4 - approach and contact
header('LET\'S CONNECT',4)
label('A CLEAR PATH FROM IDEA TO LAUNCH',42,98,ORANGE,9)
text('Build with purpose.',42,124,32,'Bold')
text('Grow together.',42,163,32,'Bold')

steps=[('01','Understand','Your problem, goals\nand requirements.'),('02','Design','The experience, plan\nand architecture.'),('03','Develop & test','Build, validate\nand refine.'),('04','Launch & improve','Deploy, learn\nand keep improving.')]
for i,(n,title,body) in enumerate(steps):
    x=42+i*131
    rect(x,228,27,3,ORANGE); text(n,x,244,10,'Bold',ORANGE)
    text(title,x,266,10.3,'Bold')
    para(body.replace('\n','<br/>'),x,288,120,9.5,GRAY,14.5)
para('We welcome individuals, entrepreneurs, startups, businesses, educational institutions and organisations ready to bring their ideas to life.',42,343,505,10.5,GRAY,15.5)

rect(0,402,W,H-402,INK)
label('LET\'S START A CONVERSATION',42,433,ORANGE,9)
text('Your next idea',42,459,32,'Bold','#FFFFFF')
text('starts here.',42,498,32,'Bold','#FFFFFF')
para('Tell us what you want to build. Let\'s explore it together.',42,548,500,11.5,'#BFC4CA',17)

label('CALL US',42,594,ORANGE,8)
text('+91 73969 87687',42,613,15,'Bold','#FFFFFF')
text('+91 78159 75323',42,638,15,'Bold','#FFFFFF')
c.linkURL('tel:+917396987687',(42,H-635,250,H-610),relative=0,thickness=0)
c.linkURL('tel:+917815975323',(42,H-660,250,H-635),relative=0,thickness=0)
label('EMAIL',305,594,ORANGE,8)
text('risetechnologies285@gmail.com',305,615,11,'Regular','#FFFFFF')
c.linkURL('mailto:risetechnologies285@gmail.com',(305,H-634,553,H-612),relative=0,thickness=0)
label('LOCATION',305,646,ORANGE,8)
text('Visakhapatnam',305,665,13,'Regular','#FFFFFF')
line(42,704,553,704,'#34373C')
label('INSTAGRAM',42,724,ORANGE,8)
text('@rise_technologies26',42,744,12,'Regular','#FFFFFF')
c.linkURL('https://www.instagram.com/rise_technologies26/',(42,H-763,245,H-741),relative=0,thickness=0)
label('LINKEDIN',305,724,ORANGE,8)
text('RISE Technologies',305,744,12,'Regular','#FFFFFF')
footer(4,True); c.showPage(); c.save()

r=PdfReader(OUT)
assert len(r.pages)==4
alltext='\n'.join(p.extract_text() for p in r.pages)
for required in ['risetechnologies285@gmail.com','+91 73969 87687','+91 78159 75323','@rise_technologies26','Visakhapatnam']:
    assert required in alltext, required
(ROOT/'tmp/pdfs/extracted_text.txt').write_text(alltext,encoding='utf-8')
print(f'Created {OUT} | {len(r.pages)} pages | {OUT.stat().st_size:,} bytes')
