#!/usr/bin/env python3
"""
Add funny, engaging female voice narration to each slide of the FHE pitch deck.
Generates TTS audio via espeak-ng + mbrola and embeds it into the PPTX.

Uses python-pptx internal APIs for proper media embedding (no manual ZIP hacking).
"""

import subprocess
import os
import shutil
import tempfile
import wave
import audioop

from pptx import Presentation
from pptx.media import Video  # reuse for audio blob container
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from lxml import etree

# ============ FULL NARRATION SCRIPTS ============
NARRATIONS = {
    1: (  # Title Slide
        "Good morning everyone, and welcome. "
        "Today's presentation is titled: FHE Project Board. "
        "And the subtitle pretty much says it all: Why Pay Rent When You Can Own? "
        "This is about An Internal Project Management Tool, Built By Engineers, For Engineers. "
        "Brought to you by Florida Horizon Engineering, February twenty twenty six. "
        "Now, before anyone starts checking their phone under the table, "
        "I promise this is worth your attention. "
        "We're about to talk about saving the company a LOT of money. "
        "And honestly? This presentation is kind of a banger. So buckle up."
    ),
    2: (  # The Problem
        "Alright, slide two. Houston, We Have a Subscription. "
        "Let's talk numbers, because these are going to hurt a little. "
        "Right now, we have five Trello Premium licenses at twelve dollars and fifty cents per user per month. "
        "That comes out to sixty two dollars and fifty cents per month. "
        "Per year? Seven hundred and fifty dollars. "
        "And over five years? Three thousand, seven hundred and fifty dollars. Just for five people. "
        "But here's where it gets really fun. "
        "And by fun, I mean painful. "
        "As we grow, it scales against us. "
        "Ten users means a hundred and twenty five dollars per month, or fifteen hundred a year. "
        "Twenty users means two hundred and fifty dollars per month, or three thousand a year. "
        "And twenty users over five years? That's fifteen thousand dollars. "
        "Fifteen. Thousand. Dollars. Paid directly to Atlassian. "
        "At this point, every time we add a team member, Atlassian sends us a thank you card. "
        "I'm kidding. They don't even do that. They just take the money."
    ),
    3: (  # What Trello Can't Do
        "Slide three. What Trello Can't Do. "
        "And honestly, this list surprised even me. "
        "Pain point number one: No Email Automation. "
        "We need incoming emails to automatically create tasks. It's a basic workflow need. "
        "Trello's answer? And I quote: Upgrade to Enterprise. End quote. "
        "How generous of them. "
        "Pain point number two: Per Seat Pricing. "
        "Every single new hire means more money out the door. "
        "Growth should NOT cost us more in software licenses. That's backwards. "
        "Pain point number three: Limited Customization. "
        "Our workflows don't fit Trello's mold. "
        "So we end up adapting to them, instead of them adapting to us. "
        "We're the customer here, right? "
        "And pain point number four: Their Data, Their Rules. "
        "All of our project data lives on Atlassian's servers. "
        "We have zero control over it. Zero. "
        "As the slide says: We're renting a tool when we could own one. "
        "And that, folks, is exactly what we're going to fix."
    ),
    4: (  # The Solution
        "Slide four. Introducing: FHE Project Board! "
        "Built BY us, FOR us. Zero subscription fees. Unlimited users. Forever. "
        "Let me walk you through what it does. "
        "First: Kanban Boards. Full drag and drop project management, just like Trello. "
        "Everything you're used to, same workflow, same card system. "
        "Second: Email Automation. "
        "Incoming emails automatically create task cards. "
        "No more copying and pasting from your inbox. It just happens. "
        "Third: Unlimited Users. "
        "Add five users, fifty users, or five hundred users. "
        "The cost per seat? Zero dollars. Always. "
        "Fourth: Custom Workflows. "
        "Tailored to FHE's actual processes, not Trello's templates. "
        "Fifth: Data Ownership. "
        "Our data stays on our servers. Full control. Full privacy. Period. "
        "And sixth: Mobile Ready. "
        "It works on any device, anywhere. It's a Progressive Web App with offline support. "
        "So basically, it's everything Trello does. Minus the invoice."
    ),
    5: (  # Live Demo
        "Slide five. Don't Take My Word For It. "
        "It's Live Demo Time! "
        "Yes, you read that correctly. It actually works. "
        "And no, this is not a PowerPoint animation pretending to be a demo. "
        "I know what you're thinking. A live demo in a pitch meeting? "
        "That's either very confident or very foolish. "
        "I like to think it's the former. "
        "Besides, confidence is free. Unlike Trello Premium. "
        "So let me switch over and show you the real thing."
    ),
    6: (  # The Money Slide
        "Alright, we're back. Slide six. Show Me The Money. "
        "This is the slide that makes accountants smile. "
        "Let's do a side by side comparison. "
        "On the left, in red, because it's painful: Trello Premium. "
        "Five years, twenty users. The total cost? "
        "Fifteen thousand dollars. "
        "Two hundred and fifty dollars per month at twenty users. "
        "Three thousand dollars per year, recurring. "
        "It scales against you as you grow. "
        "No email automation included. And your data sits on Atlassian's servers. "
        "Now, on the right, in green, because it feels good: FHE Project Board. "
        "Five years. The total cost? "
        "One thousand, two hundred and seventy five dollars. "
        "That's about two hundred and fifty five dollars per year for hosting and domain. "
        "Unlimited users with no per seat cost. "
        "Email automation built right in. "
        "Full data ownership. Custom workflows. "
        "And now for the punchline. The bottom of the slide, in big green letters: "
        "Save thirteen thousand, seven hundred and twenty five dollars plus, over five years. "
        "That's ninety one percent less than Trello. "
        "Math doesn't lie. And neither do I. Usually."
    ),
    7: (  # ROI Breakdown
        "Slide seven. The Math Doesn't Lie. "
        "Let me walk you through the year by year breakdown. "
        "Year one: Trello costs about a thousand and fifty dollars as we're growing. "
        "FHE Project Board costs five hundred for initial setup and hosting. "
        "Savings in year one: five hundred and fifty dollars. "
        "Year two: Trello jumps to eighteen hundred. FHE stays at two fifty five. "
        "Savings: fifteen forty five. "
        "Year three: Trello is twenty four hundred. FHE? Still two fifty five. "
        "Savings: twenty one forty five. "
        "Years four and five: Trello plateaus at three thousand per year. "
        "FHE? You guessed it. Two fifty five. Each year. "
        "Five year totals: Trello costs eleven thousand, two hundred and fifty dollars. "
        "FHE costs fifteen hundred and twenty dollars. "
        "Total savings: nine thousand, seven hundred and thirty dollars. "
        "Now let me hit you with three key numbers at the bottom. "
        "Break even: Month Three. It pays for itself in ninety days. "
        "That's faster than most of us finish our onboarding paperwork. "
        "Cost per new hire: Zero dollars. "
        "With Trello it's twelve fifty per month. With us, it's free. "
        "And five year savings: nine thousand, seven hundred and thirty dollars plus. "
        "And that's a conservative estimate. "
        "Every new hire is free, not twelve fifty a month. "
        "Growth should make us money, not cost us more in software."
    ),
    8: (  # Bonus Features
        "Slide eight. But Wait, There's More! "
        "And I promise, this is not an infomercial. No steak knives included. "
        "Let me walk you through the bonus features. "
        "First: Email Automation. "
        "Incoming emails automatically become task cards. "
        "You can filter by sender, subject, or recipient. No more manual data entry. "
        "Your inbox talks directly to the board. "
        "Second: Custom Workflows. "
        "Tailored to how FHE actually works. "
        "Not forced into Trello's cookie cutter templates. Our processes, our rules. "
        "Third: Full Data Ownership. "
        "Data stays on OUR servers. No third party access. Full compliance. "
        "Backups happen on our schedule, not theirs. "
        "And Fourth: Works Everywhere. "
        "It's a mobile responsive Progressive Web App. "
        "Desktop, tablet, phone. Offline support built right in. "
        "As the bottom of the slide says: "
        "No more, quote, Sorry that's a Premium feature, end quote. "
        "With our tool, EVERYTHING is a premium feature. Because it's ours."
    ),
    9: (  # The Ask
        "Slide nine. The Ask. "
        "So, what do we need to make this happen? And honestly, it's surprisingly small. "
        "Three things. "
        "Number one: Development Time. Forty to sixty hours to finish and polish. "
        "That's it. The hard part is already done. "
        "Number two: Hosting Budget. Twenty dollars per month for cloud hosting. "
        "That's less than what we pay per person for Trello. "
        "Number three: Timeline. Two to four weeks to full deployment. "
        "Now let me put this in perspective, because this is the important part. "
        "The total investment is less than ONE single month of Trello at scale. "
        "One month. That's two hundred and fifty dollars. "
        "We already have a working prototype. You literally just saw it running. "
        "And the return on investment is positive by month three. "
        "Honestly? This is the easiest yes you'll give all quarter."
    ),
    10: (  # Closing
        "And finally, slide ten. "
        "Own Your Tools. Own Your Future. "
        "FHE Project Board. Built by Engineers, for Engineers. "
        "Let me leave you with the four big takeaways. "
        "Ninety one percent cost savings. "
        "Unlimited users, forever. "
        "Email automation, built right in. "
        "And full data control, on our servers. "
        "P.S., Atlassian won't miss us. They have plenty of subscribers. "
        "Thank you, everyone. I'm happy to take questions."
    ),
}

# XML Namespaces
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main"


def generate_audio(slide_num, text, output_dir):
    """Generate WAV audio using espeak-ng with mbrola female voice, at 44.1kHz."""
    raw_path = os.path.join(output_dir, f"slide{slide_num}_raw.wav")
    final_path = os.path.join(output_dir, f"slide{slide_num}.wav")

    cmd = [
        "espeak-ng", "-v", "mb-us1",
        "-s", "150", "-p", "55", "-a", "180",
        "-w", raw_path, text,
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    # Upsample 16kHz -> 44100Hz for PowerPoint compatibility
    with wave.open(raw_path, 'rb') as win:
        params = win.getparams()
        frames = win.readframes(params.nframes)

    converted, _ = audioop.ratecv(
        frames, params.sampwidth, params.nchannels,
        params.framerate, 44100, None
    )

    with wave.open(final_path, 'wb') as wout:
        wout.setnchannels(params.nchannels)
        wout.setsampwidth(params.sampwidth)
        wout.setframerate(44100)
        wout.writeframes(converted)

    os.remove(raw_path)
    return final_path


def _find_max_shape_id(sp_tree):
    """Find the highest shape id in the shape tree."""
    max_id = 0
    for elem in sp_tree.iter():
        tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
        if tag == 'cNvPr':
            try:
                sid = int(elem.get('id', '0'))
                if sid > max_id:
                    max_id = sid
            except ValueError:
                pass
    return max_id


def _add_audio_shape(sp_tree, shape_id, audio_rid, media_rid):
    """Add an audio pic shape to the slide's shape tree."""
    pic = etree.SubElement(sp_tree, f"{{{P_NS}}}pic")

    # nvPicPr
    nvPicPr = etree.SubElement(pic, f"{{{P_NS}}}nvPicPr")
    cNvPr = etree.SubElement(nvPicPr, f"{{{P_NS}}}cNvPr")
    cNvPr.set("id", str(shape_id))
    cNvPr.set("name", f"Audio {shape_id}")
    hlinkClick = etree.SubElement(cNvPr, f"{{{A_NS}}}hlinkClick")
    hlinkClick.set(f"{{{R_NS}}}id", "")
    hlinkClick.set("action", "ppaction://media")

    cNvPicPr = etree.SubElement(nvPicPr, f"{{{P_NS}}}cNvPicPr")
    etree.SubElement(cNvPicPr, f"{{{A_NS}}}picLocks").set("noChangeAspect", "1")

    nvPr = etree.SubElement(nvPicPr, f"{{{P_NS}}}nvPr")
    audioFile = etree.SubElement(nvPr, f"{{{A_NS}}}audioFile")
    audioFile.set(f"{{{R_NS}}}link", audio_rid)

    extLst = etree.SubElement(nvPr, f"{{{P_NS}}}extLst")
    ext_el = etree.SubElement(extLst, f"{{{P_NS}}}ext")
    ext_el.set("uri", "{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}")
    p14media = etree.SubElement(ext_el, f"{{{P14_NS}}}media")
    p14media.set(f"{{{R_NS}}}embed", media_rid)

    # blipFill (required even for audio)
    blipFill = etree.SubElement(pic, f"{{{P_NS}}}blipFill")
    etree.SubElement(blipFill, f"{{{A_NS}}}blip")
    stretch = etree.SubElement(blipFill, f"{{{A_NS}}}stretch")
    etree.SubElement(stretch, f"{{{A_NS}}}fillRect")

    # spPr - small speaker icon area (bottom-left corner)
    spPr = etree.SubElement(pic, f"{{{P_NS}}}spPr")
    xfrm = etree.SubElement(spPr, f"{{{A_NS}}}xfrm")
    off = etree.SubElement(xfrm, f"{{{A_NS}}}off")
    off.set("x", "457200")
    off.set("y", "6400800")
    ext_sz = etree.SubElement(xfrm, f"{{{A_NS}}}ext")
    ext_sz.set("cx", "457200")
    ext_sz.set("cy", "457200")
    prstGeom = etree.SubElement(spPr, f"{{{A_NS}}}prstGeom")
    prstGeom.set("prst", "rect")
    etree.SubElement(prstGeom, f"{{{A_NS}}}avLst")

    return shape_id


def _add_audio_timing(slide_element, shape_id):
    """Add timing XML to auto-play the audio when the slide appears."""
    # Remove any existing timing
    for old in slide_element.findall(f"{{{P_NS}}}timing"):
        slide_element.remove(old)

    timing = etree.SubElement(slide_element, f"{{{P_NS}}}timing")
    tnLst = etree.SubElement(timing, f"{{{P_NS}}}tnLst")
    par1 = etree.SubElement(tnLst, f"{{{P_NS}}}par")

    cTn1 = etree.SubElement(par1, f"{{{P_NS}}}cTn")
    cTn1.set("id", "1"); cTn1.set("dur", "indefinite")
    cTn1.set("restart", "never"); cTn1.set("nodeType", "tmRoot")

    childTnLst1 = etree.SubElement(cTn1, f"{{{P_NS}}}childTnLst")
    seq = etree.SubElement(childTnLst1, f"{{{P_NS}}}seq")
    seq.set("concurrent", "1"); seq.set("nextAc", "seek")

    cTn2 = etree.SubElement(seq, f"{{{P_NS}}}cTn")
    cTn2.set("id", "2"); cTn2.set("dur", "indefinite")
    cTn2.set("nodeType", "mainSeq")

    childTnLst2 = etree.SubElement(cTn2, f"{{{P_NS}}}childTnLst")
    par2 = etree.SubElement(childTnLst2, f"{{{P_NS}}}par")
    cTn3 = etree.SubElement(par2, f"{{{P_NS}}}cTn")
    cTn3.set("id", "3"); cTn3.set("fill", "hold")
    stCond3 = etree.SubElement(cTn3, f"{{{P_NS}}}stCondLst")
    etree.SubElement(stCond3, f"{{{P_NS}}}cond").set("delay", "0")

    childTnLst3 = etree.SubElement(cTn3, f"{{{P_NS}}}childTnLst")
    par3 = etree.SubElement(childTnLst3, f"{{{P_NS}}}par")
    cTn4 = etree.SubElement(par3, f"{{{P_NS}}}cTn")
    cTn4.set("id", "4"); cTn4.set("fill", "hold")
    stCond4 = etree.SubElement(cTn4, f"{{{P_NS}}}stCondLst")
    etree.SubElement(stCond4, f"{{{P_NS}}}cond").set("delay", "0")

    childTnLst4 = etree.SubElement(cTn4, f"{{{P_NS}}}childTnLst")

    # The audio playback node
    audio_el = etree.SubElement(childTnLst4, f"{{{P_NS}}}audio")
    cMediaNode = etree.SubElement(audio_el, f"{{{P_NS}}}cMediaNode")
    cMediaNode.set("vol", "80000")
    cTn5 = etree.SubElement(cMediaNode, f"{{{P_NS}}}cTn")
    cTn5.set("id", "5"); cTn5.set("fill", "hold"); cTn5.set("display", "0")
    stCond5 = etree.SubElement(cTn5, f"{{{P_NS}}}stCondLst")
    etree.SubElement(stCond5, f"{{{P_NS}}}cond").set("delay", "0")

    tgtEl = etree.SubElement(cMediaNode, f"{{{P_NS}}}tgtEl")
    etree.SubElement(tgtEl, f"{{{P_NS}}}spTgt").set("spid", str(shape_id))

    # Navigation conditions
    for lst_tag, evt in [("prevCondLst", "onPrev"), ("nextCondLst", "onNext")]:
        condLst = etree.SubElement(seq, f"{{{P_NS}}}{lst_tag}")
        cond = etree.SubElement(condLst, f"{{{P_NS}}}cond")
        cond.set("evt", evt); cond.set("delay", "0")
        tgt = etree.SubElement(cond, f"{{{P_NS}}}tgtEl")
        etree.SubElement(tgt, f"{{{P_NS}}}sldTgt")


def main():
    pptx_input = "/home/user/fhe-TRELLO-/FHE_Project_Board_Pitch.pptx"
    pptx_output = "/home/user/fhe-TRELLO-/FHE_Project_Board_Pitch_Narrated.pptx"
    audio_dir = tempfile.mkdtemp(prefix="slide_audio_")

    # Ensure base presentation exists
    if not os.path.exists(pptx_input):
        print("Base presentation not found. Generating...")
        subprocess.run(["python3", "/home/user/fhe-TRELLO-/create_presentation.py"], check=True)

    print("=" * 60)
    print("GENERATING FULL SLIDE NARRATIONS (Female Voice)")
    print("=" * 60)

    wav_files = {}
    for slide_num, text in sorted(NARRATIONS.items()):
        print(f"  Slide {slide_num}...", end=" ", flush=True)
        wav_path = generate_audio(slide_num, text, audio_dir)
        wav_files[slide_num] = wav_path
        with wave.open(wav_path, 'rb') as w:
            dur = w.getnframes() / w.getframerate()
        print(f"{dur:.0f}s ({os.path.getsize(wav_path) // 1024} KB)")

    print()
    print("=" * 60)
    print("EMBEDDING AUDIO VIA PYTHON-PPTX API")
    print("=" * 60)

    # Open presentation through python-pptx (proper OPC packaging)
    prs = Presentation(pptx_input)

    for slide_num, wav_path in sorted(wav_files.items()):
        slide = prs.slides[slide_num - 1]
        slide_part = slide.part

        # Read WAV blob
        with open(wav_path, 'rb') as f:
            wav_blob = f.read()

        # Use Video class as a blob container (works for any media type)
        media_obj = Video.from_blob(wav_blob, "audio/x-wav", f"narration{slide_num}.wav")

        # Add media part to the package (reuses python-pptx packaging)
        media_part = prs.part.package.get_or_add_media_part(media_obj)

        # Create TWO relationships (this is what PowerPoint requires):
        # 1. RT.MEDIA - for p14:media r:embed
        media_rid = slide_part.relate_to(media_part, RT.MEDIA)
        # 2. RT.AUDIO - for a:audioFile r:link
        audio_rid = slide_part.relate_to(media_part, RT.AUDIO)

        # Access slide XML and add audio shape + timing
        slide_elem = slide._element
        sp_tree = slide_elem.find(f".//{{{P_NS}}}spTree")

        shape_id = _find_max_shape_id(sp_tree) + 10
        _add_audio_shape(sp_tree, shape_id, audio_rid, media_rid)
        _add_audio_timing(slide_elem, shape_id)

        print(f"  Slide {slide_num}: audio_rId={audio_rid} media_rId={media_rid} shape={shape_id}")

    # Save through python-pptx (proper OPC packaging, Content_Types, etc.)
    prs.save(pptx_output)

    print(f"\n  Saved: {pptx_output}")
    print(f"  Size: {os.path.getsize(pptx_output) / (1024*1024):.1f} MB")

    # Cleanup
    shutil.rmtree(audio_dir, ignore_errors=True)

    print()
    print("=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"\nOpen in PowerPoint -> F5 for slideshow -> Audio auto-plays!")


if __name__ == "__main__":
    main()
