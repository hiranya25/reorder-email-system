/**
 * Common first names (lower case) used to tell a person's inbox ("oliver@") from a
 * company one ("harings@", "zzltd@"). A wrong guess is worse than no name, so only
 * known names are used; everything else falls back to "Hi <Company> team".
 */
const FIRST_NAMES = new Set(
  (
    "aaron abby abe abraham adam adrian aidan alan albert alex alexa alexander alexis alice alicia alison allen allison alyssa amanda amber amelia amit amy ana andre andrea andrew andy angela angie anita ann anna anne annie anthony antonio april arjun arthur ashley audrey austin ava avi barbara barry ben benjamin bernard beth betty bev beverly bill billy blake bob bobby bonnie brad bradley brandi brandie brandon brenda brent brett brian brittany brooke bruce bryan caleb cameron candice carl carla carlos carol caroline carolyn carrie casey cassie cathy catherine chad charles charlie charlotte chase chelsea cheryl chloe chris christian christina christine christopher cindy claire clara cliff clint cody colin colleen connie craig crystal curtis cynthia dale dan dana daniel danielle danny darren dave david dawn dean debbie debra deb deborah denise dennis derek diana diane dick dina dominic don donald donna doug douglas drew dustin dylan ed eddie edward elaine elan eleanor elena eli elijah elizabeth ella ellen emily emma eric erica erik erika erin ethan eva evan faith felix frank gabriel gail gary gavin george gina glen glenn gloria grace greg gregory hailey hannah harold harry heather heidi helen henry holly howard ian irene isaac isabella jack jackie jacob jake james jamie jane janet janice jared jasmine jason jay jean jeff jeffrey jen jenna jennifer jenny jeremy jerry jess jessica jill jim jimmy jo joan joann joanne jody joe joel joey john johnny jon jonathan jordan jose joseph josh joshua joy joyce juan judith judy julia julie justin jyoti karen kari karl kate katherine kathleen kathy katie kay keith kelly ken kendra kenneth kevin kim kimberly kirk kris kristen kristin kristina kurt kyle lance larry laura lauren laurie lee leah leo leon leslie liam lili lily linda lindsay lindsey lisa liz logan lori lorraine louis lucas lucy luis luke lynn madison maggie mandy marc marcia marcus margaret maria marie marilyn mario marissa mark marsha martha martin marty mary matt matthew maureen max maya megan meghan melanie melissa michael michele michelle mike mindy miranda misty mitch mitchell molly monica morgan nancy naomi natalie nathan nathalie neil nicholas nick nicole nikhil nina noah noel nora norman olivia oliver omar pam pamela pat patricia patrick paul paula peggy penny pete peter phil philip phillip priya rachel rahul raj raju ralph randy ray raymond rebecca regina renee rhonda ricardo rich richard rick ricky rita rob robert roberta robin rodney roger ron ronald ronnie rose ross roy ruby russell ruth ryan sally sam samantha samuel sandee sandra sandy sara sarah scott sean seth shane shannon sharon shawn sheila shelly sherry shirley shreya shruti sophia stacey stacy stan stanley stephanie stephen steve steven stuart sue susan suzanne suzy sydney tammy tanya tara ted teresa terri terry theresa thomas tiffany tim timothy tina todd tom tommy tony tracy travis trevor troy tyler valerie vanessa vicki victor victoria vincent virginia vivek walter wanda wayne wendy whitney william willie zach zachary zoe skip"
  ).split(" "),
);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** "mindy.beck@amross.com" -> "Mindy"; "info@x.com" or "zzltd@x.com" -> undefined. */
export function firstNameFromEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const first = local.split(/[._\-+]/)[0] ?? "";
  return FIRST_NAMES.has(first) ? capitalize(first) : undefined;
}

const NOT_A_PERSON = new Set(["company", "house", "sales", "office", "admin", "na", "none", "unassigned", "comp", "team"]);

/** Rep codes like "JYOTI" become "Jyoti"; codes like "CS-AM", "SALES5" or "COMPANY" return undefined. */
export function repDisplayName(rep: string): string | undefined {
  const r = rep.trim();
  if (!/^[A-Za-z]{2,15}$/.test(r) || NOT_A_PERSON.has(r.toLowerCase())) return undefined;
  return capitalize(r);
}
