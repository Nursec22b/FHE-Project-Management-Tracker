#!/usr/bin/env python3
"""
Add funny, engaging female voice narration to each slide of the FHE pitch deck.
Generates TTS audio via espeak-ng + mbrola and embeds it into the PPTX.

The narration is a FULL presentation - reading through actual slide content,
figures, and data points while being funny and engaging.
"""

import subprocess
import os
import shutil
import zipfile
import tempfile
import wave
import audioop
from lxml import etree

# ============ FULL NARRATION SCRIPTS ============
# These are complete presentation narrations that cover ALL content on each slide.

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


def generate_audio(slide_num, text, output_dir):
    """Generate WAV audio using espeak-ng with mbrola female voice, upsampled to 44.1kHz."""
    raw_path = os.path.join(output_dir, f"slide{slide_num}_raw.wav")
    final_path = os.path.join(output_dir, f"slide{slide_num}.wav")

    # Generate with espeak-ng (outputs 16kHz)
    cmd = [
        "espeak-ng",
        "-v", "mb-us1",
        "-s", "150",       # speaking rate
        "-p", "55",        # pitch
        "-a", "180",       # amplitude
        "-w", raw_path,
        text,
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    # Upsample to 44100 Hz for maximum PowerPoint compatibility
    with wave.open(raw_path, 'rb') as win:
        params = win.getparams()
        frames = win.readframes(params.nframes)

    # Resample from 16000 to 44100
    converted, _ = audioop.ratecv(frames, params.sampwidth, params.nchannels,
                                   params.framerate, 44100, None)

    with wave.open(final_path, 'wb') as wout:
        wout.setnchannels(params.nchannels)
        wout.setsampwidth(params.sampwidth)
        wout.setframerate(44100)
        wout.writeframes(converted)

    os.remove(raw_path)
    return final_path


def embed_audio_in_pptx(pptx_path, audio_files, output_path):
    """
    Embed WAV audio into each slide of a PPTX with auto-play on slide show.

    PowerPoint requires:
    1. Audio files in ppt/media/
    2. TWO relationships per audio: 'audio' type + 'media' type (different rIds)
    3. Proper audio shape XML referencing both rIds
    4. Timing XML for auto-play
    5. WAV registered in [Content_Types].xml
    """
    work_dir = tempfile.mkdtemp(prefix="pptx_audio_")

    try:
        # Extract PPTX
        with zipfile.ZipFile(pptx_path, 'r') as z:
            z.extractall(work_dir)

        # Register WAV content type
        ct_path = os.path.join(work_dir, "[Content_Types].xml")
        ct_tree = etree.parse(ct_path)
        ct_root = ct_tree.getroot()
        ct_ns = ct_root.nsmap.get(None, "http://schemas.openxmlformats.org/package/2006/content-types")

        wav_registered = False
        for elem in ct_root:
            if elem.get("Extension") == "wav":
                wav_registered = True
                break
        if not wav_registered:
            ext_elem = etree.SubElement(ct_root, f"{{{ct_ns}}}Default")
            ext_elem.set("Extension", "wav")
            ext_elem.set("ContentType", "audio/x-wav")

        ct_tree.write(ct_path, xml_declaration=True, encoding="UTF-8", standalone=True)

        # Namespace constants
        REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
        AUDIO_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio"
        MEDIA_REL_TYPE = "http://schemas.microsoft.com/office/2007/relationships/media"
        P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
        A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
        R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main"

        # Process each slide
        for slide_num, wav_path in sorted(audio_files.items()):
            slide_idx = slide_num
            slide_xml_path = os.path.join(work_dir, "ppt", "slides", f"slide{slide_idx}.xml")
            rels_dir = os.path.join(work_dir, "ppt", "slides", "_rels")
            rels_path = os.path.join(rels_dir, f"slide{slide_idx}.xml.rels")

            if not os.path.exists(slide_xml_path):
                print(f"  Warning: slide{slide_idx}.xml not found, skipping")
                continue

            # Copy audio file to ppt/media/
            media_dir = os.path.join(work_dir, "ppt", "media")
            os.makedirs(media_dir, exist_ok=True)
            audio_filename = f"narration{slide_idx}.wav"
            shutil.copy2(wav_path, os.path.join(media_dir, audio_filename))

            # === RELATIONSHIPS ===
            os.makedirs(rels_dir, exist_ok=True)
            if os.path.exists(rels_path):
                rels_tree = etree.parse(rels_path)
                rels_root = rels_tree.getroot()
            else:
                rels_root = etree.Element(f"{{{REL_NS}}}Relationships")
                rels_tree = etree.ElementTree(rels_root)

            # Find next available rId
            existing_ids = []
            for rel in rels_root:
                rid = rel.get("Id", "")
                if rid.startswith("rId"):
                    try:
                        existing_ids.append(int(rid[3:]))
                    except ValueError:
                        pass
            next_id = max(existing_ids) + 1 if existing_ids else 1

            # Relationship 1: audio type (used by a:audioFile r:link)
            audio_rid = f"rId{next_id}"
            audio_rel = etree.SubElement(rels_root, f"{{{REL_NS}}}Relationship")
            audio_rel.set("Id", audio_rid)
            audio_rel.set("Type", AUDIO_REL_TYPE)
            audio_rel.set("Target", f"../media/{audio_filename}")

            # Relationship 2: media type (used by p14:media r:embed)
            media_rid = f"rId{next_id + 1}"
            media_rel = etree.SubElement(rels_root, f"{{{REL_NS}}}Relationship")
            media_rel.set("Id", media_rid)
            media_rel.set("Type", MEDIA_REL_TYPE)
            media_rel.set("Target", f"../media/{audio_filename}")

            rels_tree.write(rels_path, xml_declaration=True, encoding="UTF-8", standalone=True)

            # === SLIDE XML ===
            slide_tree = etree.parse(slide_xml_path)
            slide_root = slide_tree.getroot()

            # Ensure p14 namespace is declared on root
            existing_nsmap = dict(slide_root.nsmap)
            if 'p14' not in existing_nsmap:
                # We need to add the namespace - lxml requires recreating the element
                new_nsmap = dict(existing_nsmap)
                new_nsmap['p14'] = P14_NS
                new_root = etree.Element(slide_root.tag, nsmap=new_nsmap)
                new_root.attrib.update(slide_root.attrib)
                for child in slide_root:
                    new_root.append(child)
                slide_root = new_root
                slide_tree = etree.ElementTree(slide_root)

            # Find spTree
            sp_tree = None
            for elem in slide_root.iter():
                if elem.tag.endswith('}spTree') or elem.tag == 'spTree':
                    sp_tree = elem
                    break

            if sp_tree is None:
                print(f"  Warning: Could not find spTree in slide {slide_idx}")
                continue

            # Find max existing shape id to avoid conflicts
            max_shape_id = 100
            for elem in sp_tree.iter():
                tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
                if tag == 'cNvPr':
                    try:
                        sid = int(elem.get('id', '0'))
                        if sid > max_shape_id:
                            max_shape_id = sid
                    except ValueError:
                        pass
            shape_id = max_shape_id + 10

            # Build the audio pic element using lxml API (avoids namespace issues)
            pic = etree.SubElement(sp_tree, f"{{{P_NS}}}pic")

            # nvPicPr
            nvPicPr = etree.SubElement(pic, f"{{{P_NS}}}nvPicPr")

            cNvPr = etree.SubElement(nvPicPr, f"{{{P_NS}}}cNvPr")
            cNvPr.set("id", str(shape_id))
            cNvPr.set("name", f"Narration {slide_idx}")

            hlinkClick = etree.SubElement(cNvPr, f"{{{A_NS}}}hlinkClick")
            hlinkClick.set(f"{{{R_NS}}}id", "")
            hlinkClick.set("action", "ppaction://media")

            cNvPicPr = etree.SubElement(nvPicPr, f"{{{P_NS}}}cNvPicPr")
            picLocks = etree.SubElement(cNvPicPr, f"{{{A_NS}}}picLocks")
            picLocks.set("noChangeAspect", "1")

            nvPr = etree.SubElement(nvPicPr, f"{{{P_NS}}}nvPr")

            audioFile = etree.SubElement(nvPr, f"{{{A_NS}}}audioFile")
            audioFile.set(f"{{{R_NS}}}link", audio_rid)

            extLst = etree.SubElement(nvPr, f"{{{P_NS}}}extLst")
            ext = etree.SubElement(extLst, f"{{{P_NS}}}ext")
            ext.set("uri", "{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}")

            p14media = etree.SubElement(ext, f"{{{P14_NS}}}media")
            p14media.set(f"{{{R_NS}}}embed", media_rid)

            # blipFill
            blipFill = etree.SubElement(pic, f"{{{P_NS}}}blipFill")
            blip = etree.SubElement(blipFill, f"{{{A_NS}}}blip")
            stretch = etree.SubElement(blipFill, f"{{{A_NS}}}stretch")
            fillRect = etree.SubElement(stretch, f"{{{A_NS}}}fillRect")

            # spPr - small icon in corner of slide
            spPr = etree.SubElement(pic, f"{{{P_NS}}}spPr")
            xfrm = etree.SubElement(spPr, f"{{{A_NS}}}xfrm")
            off = etree.SubElement(xfrm, f"{{{A_NS}}}off")
            off.set("x", "457200")   # 0.5 inches from left
            off.set("y", "6400800")  # near bottom
            ext_size = etree.SubElement(xfrm, f"{{{A_NS}}}ext")
            ext_size.set("cx", "457200")  # 0.5 inch wide
            ext_size.set("cy", "457200")  # 0.5 inch tall
            prstGeom = etree.SubElement(spPr, f"{{{A_NS}}}prstGeom")
            prstGeom.set("prst", "rect")
            avLst = etree.SubElement(prstGeom, f"{{{A_NS}}}avLst")

            # === TIMING for auto-play ===
            # Remove existing timing
            for existing_timing in slide_root.findall(f"{{{P_NS}}}timing"):
                slide_root.remove(existing_timing)

            timing = etree.SubElement(slide_root, f"{{{P_NS}}}timing")
            tnLst = etree.SubElement(timing, f"{{{P_NS}}}tnLst")
            par1 = etree.SubElement(tnLst, f"{{{P_NS}}}par")
            cTn1 = etree.SubElement(par1, f"{{{P_NS}}}cTn")
            cTn1.set("id", "1")
            cTn1.set("dur", "indefinite")
            cTn1.set("restart", "never")
            cTn1.set("nodeType", "tmRoot")

            childTnLst1 = etree.SubElement(cTn1, f"{{{P_NS}}}childTnLst")
            seq = etree.SubElement(childTnLst1, f"{{{P_NS}}}seq")
            seq.set("concurrent", "1")
            seq.set("nextAc", "seek")

            cTn2 = etree.SubElement(seq, f"{{{P_NS}}}cTn")
            cTn2.set("id", "2")
            cTn2.set("dur", "indefinite")
            cTn2.set("nodeType", "mainSeq")

            childTnLst2 = etree.SubElement(cTn2, f"{{{P_NS}}}childTnLst")
            par2 = etree.SubElement(childTnLst2, f"{{{P_NS}}}par")
            cTn3 = etree.SubElement(par2, f"{{{P_NS}}}cTn")
            cTn3.set("id", "3")
            cTn3.set("fill", "hold")

            stCondLst3 = etree.SubElement(cTn3, f"{{{P_NS}}}stCondLst")
            cond3 = etree.SubElement(stCondLst3, f"{{{P_NS}}}cond")
            cond3.set("delay", "0")

            childTnLst3 = etree.SubElement(cTn3, f"{{{P_NS}}}childTnLst")
            par3 = etree.SubElement(childTnLst3, f"{{{P_NS}}}par")
            cTn4 = etree.SubElement(par3, f"{{{P_NS}}}cTn")
            cTn4.set("id", "4")
            cTn4.set("fill", "hold")

            stCondLst4 = etree.SubElement(cTn4, f"{{{P_NS}}}stCondLst")
            cond4 = etree.SubElement(stCondLst4, f"{{{P_NS}}}cond")
            cond4.set("delay", "0")

            childTnLst4 = etree.SubElement(cTn4, f"{{{P_NS}}}childTnLst")

            # Audio node
            audio = etree.SubElement(childTnLst4, f"{{{P_NS}}}audio")
            cMediaNode = etree.SubElement(audio, f"{{{P_NS}}}cMediaNode")
            cMediaNode.set("vol", "80000")

            cTn5 = etree.SubElement(cMediaNode, f"{{{P_NS}}}cTn")
            cTn5.set("id", "5")
            cTn5.set("fill", "hold")
            cTn5.set("display", "0")

            stCondLst5 = etree.SubElement(cTn5, f"{{{P_NS}}}stCondLst")
            cond5 = etree.SubElement(stCondLst5, f"{{{P_NS}}}cond")
            cond5.set("delay", "0")

            tgtEl = etree.SubElement(cMediaNode, f"{{{P_NS}}}tgtEl")
            spTgt = etree.SubElement(tgtEl, f"{{{P_NS}}}spTgt")
            spTgt.set("spid", str(shape_id))

            # Prev/Next conditions for the sequence
            prevCondLst = etree.SubElement(seq, f"{{{P_NS}}}prevCondLst")
            prevCond = etree.SubElement(prevCondLst, f"{{{P_NS}}}cond")
            prevCond.set("evt", "onPrev")
            prevCond.set("delay", "0")
            prevTgtEl = etree.SubElement(prevCond, f"{{{P_NS}}}tgtEl")
            etree.SubElement(prevTgtEl, f"{{{P_NS}}}sldTgt")

            nextCondLst = etree.SubElement(seq, f"{{{P_NS}}}nextCondLst")
            nextCond = etree.SubElement(nextCondLst, f"{{{P_NS}}}cond")
            nextCond.set("evt", "onNext")
            nextCond.set("delay", "0")
            nextTgtEl = etree.SubElement(nextCond, f"{{{P_NS}}}tgtEl")
            etree.SubElement(nextTgtEl, f"{{{P_NS}}}sldTgt")

            slide_tree.write(slide_xml_path, xml_declaration=True, encoding="UTF-8", standalone=True)
            print(f"  Embedded audio in slide {slide_idx}")

        # Repack into PPTX (preserve file order for compatibility)
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for dirpath, dirnames, filenames in os.walk(work_dir):
                # Sort for deterministic output
                dirnames.sort()
                filenames.sort()
                for fn in filenames:
                    full_path = os.path.join(dirpath, fn)
                    arcname = os.path.relpath(full_path, work_dir)
                    # [Content_Types].xml should be first for compatibility
                    zout.write(full_path, arcname)

        print(f"\n  Narrated presentation saved to: {output_path}")
        print(f"  File size: {os.path.getsize(output_path) / (1024*1024):.1f} MB")

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    pptx_input = "/home/user/fhe-TRELLO-/FHE_Project_Board_Pitch.pptx"
    pptx_output = "/home/user/fhe-TRELLO-/FHE_Project_Board_Pitch_Narrated.pptx"
    audio_dir = tempfile.mkdtemp(prefix="slide_audio_")

    # First, make sure the base presentation exists
    if not os.path.exists(pptx_input):
        print("Base presentation not found. Generating it first...")
        subprocess.run(["python3", "/home/user/fhe-TRELLO-/create_presentation.py"], check=True)

    print("=" * 60)
    print("GENERATING FULL SLIDE NARRATIONS (Female Voice)")
    print("=" * 60)

    audio_files = {}
    for slide_num, text in sorted(NARRATIONS.items()):
        print(f"  Slide {slide_num}...")
        wav_path = generate_audio(slide_num, text, audio_dir)
        audio_files[slide_num] = wav_path
        # Report duration
        with wave.open(wav_path, 'rb') as w:
            dur = w.getnframes() / w.getframerate()
        size_kb = os.path.getsize(wav_path) / 1024
        print(f"    {dur:.0f}s / {size_kb:.0f} KB")

    print()
    print("=" * 60)
    print("EMBEDDING AUDIO INTO PRESENTATION")
    print("=" * 60)

    embed_audio_in_pptx(pptx_input, audio_files, pptx_output)

    # Cleanup temp audio
    shutil.rmtree(audio_dir, ignore_errors=True)

    print()
    print("=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"\nOpen {pptx_output} in PowerPoint")
    print("Press F5 for slideshow mode - each slide auto-narrates!")


if __name__ == "__main__":
    main()
